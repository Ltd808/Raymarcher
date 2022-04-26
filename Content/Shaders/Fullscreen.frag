// Math, concepts, and inspiration from Inigo Quilez: https://iquilezles.org/
#version 460 core

// IO
out vec4 FragColor;
in vec2 texCoords; 

// General uniforms
uniform vec2 resolution;
uniform float time;

// Camera uniforms
uniform vec3 cameraPosition;
uniform vec3 cameraForward;
uniform vec3 cameraRight;
uniform vec3 cameraUp;
uniform float fov = 45.0;

// Shadow control
uniform bool areShadowsOn = true;

// Raymarch settings
const int MAX_STEPS = 100;
const float MAX_DISTANCE = 100;
const float MIN_DISTANCE = 0.01f;
const float SHADOW_JUMP_DISTANCE = 0.02f; // make this bigger than above, used to shoot shadow ray so that it does not stop on first iteration

// Material IDs
const int MAT_DEFAULT = 0;
const int MAT_REFLECTIVE = 1;
const int MAT_REFRACTIVE = 2;

struct Material
{
    int id;
    vec3 color;
    float specular;
};

struct SceneData
{
    float dist; // distance to closest object in scene
    Material material; // color of closest object
};

struct Hit 
{
    float dist;
    vec3 position;
    vec3 normal;
    Material material;
};

struct DirectionalLight 
{
    vec3 direction;
    vec3 color;
    float intensity;
};

struct PointLight 
{
    vec3 position;
    vec3 color;
    float intensity;
};

// SDFS
float sdfPlane(vec3 position, vec3 normal, float height)
{
  return dot(position, normal) + height;
}

float sdfSphere(vec3 position, vec3 center, float radius)
{
    return length(center - position) - radius;
}

float sdfBox(vec3 position, vec3 center, vec3 bounds)
{
  vec3 offset = abs(position - center) - bounds;

  // Sum distances from outside and inside box
  return length(max(offset, 0.0)) + min(max(offset.x, max(offset.y, offset.z)), 0.0);
}

// Operations
float opUnion(float d1, float d2) { return min(d1, d2); }

float opSubtraction(float d1, float d2) { return max(-d1, d2); }

float opIntersection(float d1, float d2) { return max(d1, d2); }

float opRepSpheres(vec3 p, vec3 c)
{
    vec3 q = mod(p + 0.5 * c, c) - 0.5 * c;
    return sdfSphere(q, vec3(0, sin(time) + 2.5, 0), 1);
}

// X is distance, Y is blend amount
vec2 smoothMinimum(float a, float b, float k)
{
    float f1 = exp2(-k * a);
    float f2 = exp2(-k * b);
    return vec2(-log2(f1 + f2) / k, f2);
}

// This function gets distance to surface and that surfaces material
SceneData getSceneData(vec3 position)
{
    SceneData sceneData;

    // Define objects
    float plane = sdfPlane(position, vec3(0, 1, 0), 0);

    float sphere = sdfSphere(position, vec3(-4, 2.5 - (sin(time) + 1), 0), 1);

    float sphere2 = sdfSphere(position, vec3(0, 2.5, 0), 1);

    float sphere3 = sdfSphere(position, vec3(4, 2.5, 0), 1);

    float sphere4 = sdfSphere(position, vec3(8, 2.5, 0), 1);

    //sceneData.dist = 1e20;

    // Smooth min all objects and mix colors
    vec2 smoothMinimum = smoothMinimum(plane, sphere, 2);

    // Cache distance
    sceneData.dist = min(smoothMinimum.x, min(sphere2, min(sphere3, sphere4)));

    // Set material color
    if(sceneData.dist == smoothMinimum.x) // smoothstep has special coloring
    {
        sceneData.material.id = MAT_DEFAULT;
        sceneData.material.color = mix(vec3(.8, .8, .8), vec3(1, 0, 0), smoothMinimum.y);
    }
    else if(sceneData.dist == sphere2)
    {
        sceneData.material.id = MAT_REFLECTIVE;
        sceneData.material.color = vec3(0, 1, 0);
    }
    else if(sceneData.dist == sphere3)
    {
        sceneData.material.id = MAT_REFRACTIVE;
        sceneData.material.color = vec3(0, 0, 1);
    }
    else
    {
        sceneData.material.id = MAT_DEFAULT;
        sceneData.material.color = vec3(1, 1, 1);
    }
    
    return sceneData;
}

// Find slope at position
vec3 calculateNormal(vec3 position) 
{
    vec2 smallStep = vec2(0.001, 0.0);
	float distanceToScene = getSceneData(position).dist;
    vec3 normal = distanceToScene - vec3(
        getSceneData(position - smallStep.xyy).dist,
        getSceneData(position - smallStep.yxy).dist,
        getSceneData(position - smallStep.yyx).dist
    );  

    return normalize(normal);
}

// Ray march from orgin in ray direction
Hit rayMarch(vec3 origin, vec3 direction) 
{
    // Struct to store data
    Hit hit; 

    SceneData sceneData;
    float totalDistance = MIN_DISTANCE;

    for(int i = 0; i < MAX_STEPS; i++) 
    {
        sceneData = getSceneData(origin + direction * totalDistance);
      
        totalDistance += sceneData.dist;

        if(abs(sceneData.dist) < MIN_DISTANCE || totalDistance > MAX_DISTANCE) 
        {
            break;
        }
    }

    // cache distance traveled and position
    hit.dist = totalDistance;
    hit.position = origin + direction * totalDistance;
    hit.material = sceneData.material;          
    hit.normal = calculateNormal(hit.position);

    return hit;
}

// Calculate a light source, directional only for now but should work for point lights
vec3 calculateLight(vec3 position, vec3 normal, vec3 lightDirection, vec3 lightColor, float lightIntensity)
{
    // Ambient
    float ambient = 0.15;//calcAO(position, normal);

    // Diffuse
    float diffuse = max(dot(normal, lightDirection), 0);

    // Shadows
    if(areShadowsOn)
    {
        //Compare raymarch distance to light with distance to light
        //Need to move the position with the normal so raymarching doesn't stop immediately
        Hit hit = rayMarch(position + normal * SHADOW_JUMP_DISTANCE, lightDirection);
    
        if(hit.dist < MAX_DISTANCE)
        {
            diffuse *= 0;//.1; // reduce brightness to 10% in shadow
        }
    }

    // Specular
    vec3 reflectDirection = reflect(lightDirection, normal);

    float specular = 0.0;

    if(diffuse > 0.0) 
    {
        float specularPower = 32.0;

        vec3 viewDirection = normalize(position - cameraPosition);
        specular = pow(max(0.0, dot(viewDirection, reflectDirection)), specularPower);
    }

    //return (ambient + diffuse + specular) * light.intensity * light.color; 
    return (diffuse + specular) * lightIntensity * lightColor; 
}

vec3 shade(Hit hit, vec3 rayDirection)
{
    DirectionalLight directionalLight;
    directionalLight.direction = vec3(0.0, -1.0, 1.0);
    directionalLight.intensity = 0.3;
    directionalLight.color = vec3(0.76, 0.77, 0.8); //moon color

    //PointLight pointLight;
    //pointLight.position = vec3(5.0, 5.0, 5.0);
    //pointLight.intensity = 0.8;
    //pointLight.color = vec3(0.8, 0.5, 0.5);

    vec3 directionalLightDirection = normalize(-directionalLight.direction);
    //vec3 pointLightDirection = normalize(pointLight.position - position);

    vec3 color;

    // Set color with hit material
    color = hit.material.color;
    vec3 bgColor = vec3(0.19, 0.23, 0.68);

    // Check if hit
    if(hit.dist < MAX_DISTANCE) 
    {
        // Hit
        // Apply lights
        color *= calculateLight(hit.position, hit.normal, directionalLightDirection, directionalLight.color, directionalLight.intensity);

        // Blend object with background with fresnel
        float fresnel = pow(1.0 + dot(rayDirection, hit.normal), 3.0);

        color = mix(color, bgColor, fresnel);
    }
    else
    {
        color = bgColor;
    }

    return color;
}

void main()
{ 
    float aspect = resolution.x / resolution.y;
    float fov2 = radians(fov) / 2;

    // convert coords from [0,1] to [-1,1]
    vec2 uv = (texCoords - 0.5) * 2.0;
    uv.x *= aspect;

    // Contribute up and right vectors
    vec2 offsetUV = uv * tan(fov2);

    float fPersp = 2.0;
    vec3 rayDirection = normalize(offsetUV.x * cameraRight + offsetUV.y * cameraUp + cameraForward * fPersp);

    // Raymarch
    Hit hit = rayMarch(cameraPosition, rayDirection);

    // Shade objects
    vec3 color = shade(hit, rayDirection);

    // Do another raymarch for reflective objects
    if(hit.material.id == MAT_REFLECTIVE)
    {
        vec3 reflectDirection = reflect(rayDirection, hit.normal);

        Hit reflectHit = rayMarch(hit.position + hit.normal * SHADOW_JUMP_DISTANCE, reflectDirection);

        color = mix(shade(reflectHit, reflectDirection), color, .5);
    }

    // Gamma correction
	color = pow(color, vec3(1.0 / 2.2));

    // Display
    FragColor.rgb = color;
}