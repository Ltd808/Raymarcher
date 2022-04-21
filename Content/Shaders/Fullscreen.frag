#version 460 core

#define EPS 0.0001
#define PI 3.14159265359
#define FLOAT_MAX 3.402823466e+38
#define FLOAT_MIN 1.175494351e-38

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

uniform bool areShadowsOn = false;

// raymarch settings
const int MAX_STEPS = 100;
const float MAX_DISTANCE = 100;
const float MIN_DISTANCE = 0.01f;
const float SHADOW_JUMP_DISTANCE = 0.02f; // make this bigger than above

struct Surface 
{
    float dist;
    vec3 position;
    vec3 baseColor;
    vec3 normal;
    vec3 emissiveColor;
};

struct Hit 
{
    Surface surface;
    Surface near;
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

// Plane sdf, n must be normalized
float sdfPlane(vec3 position, vec3 normal, float height)
{
  return dot(position, normal) + height;
}

// Sphere sdf
float sdfSphere(vec3 position, vec3 center, float radius)
{
    return length(center - position) - radius;
}

// Box sdf
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

float opRep(vec3 p, vec3 c)
{
    vec3 q = mod(p + 0.5 * c, c) - 0.5 * c;
    return sdfBox(q, vec3(0, sin(time + q.x * 0.5) * .1, 0), vec3(0.8, 1, 0.8));
}

float smin( float a, float b, float k )
{
    float h = max(k - abs(a - b), 0.0 ) / k;
    return min(a, b) - h * h * k * (1.0 / 4.0);
}

float sdfScene(vec3 position)
{
    //Sphere
    float sphere = sdfSphere(position, vec3(0, sin(time) + 2.5, 0), 1);

    // Distortion
    //float d = sin(5.0 * point.x) * sin(5.0 * point.y) * sin(5.0 * point.z) * 0.25;

    float plane = sdfPlane(position, vec3(0, 1, 0), 0);

    float boxes = opRep(position, vec3(10, 10, 10));

    float test = smin(sphere, plane, 2);

    return boxes;
}

// Find slope at position
vec3 calculateNormal(vec3 position) 
{
    vec2 smallStep = vec2(0.001, 0.0);
	float distanceToScene = sdfScene(position);
    vec3 normal = distanceToScene - vec3(
        sdfScene(position - smallStep.xyy),
        sdfScene(position - smallStep.yxy),
        sdfScene(position - smallStep.yyx)
    );  

    return normalize(normal);
}

// Compute soft shadows for a given light, with a single
// ray insead of using montecarlo integration or shadowmap
// blurring. More info here:
//
// https://iquilezles.org/articles/rmshadows
//
//float calcSoftshadow(in vec3 ro, in vec3 rd, in float mint, in float tmax, in float time, float k )
//{
//    // raymarch and track penumbra    
//    float res = 1.0;
//    float t = mint;
//    for( int i=0; i<128; i++ )
//    {
//        float kk; vec3 kk2;
//		float h = sdfScene(ro + rd * t, time, kk, kk2 ).x;
//        res = min( res, k*h/t );
//        t += clamp( h, 0.005, 0.1 );
//        if( res<0.002 || t>tmax ) break;
//    }
//    return max( res, 0.0 );
//}


Hit rayMarch(vec3 origin, vec3 direction) 
{
    Surface cs;  // current surface
    cs.dist = -1.0;
    
    Surface ns; // near surface
    ns.dist = FLOAT_MAX;
    
    Hit hit;

    float distanceToScene = 0.0;
    float totalDistance = MIN_DISTANCE;

    for(int i = 0; i < MAX_STEPS; i++) 
    {
        distanceToScene = sdfScene(origin + direction * totalDistance);
      
        // cache near distance
        if(distanceToScene < ns.dist) 
        {
            ns.dist = distanceToScene;
        }
        
        if((abs(distanceToScene) < MIN_DISTANCE) || (totalDistance > MAX_DISTANCE)) 
        {
            break;
        }
        
        totalDistance += distanceToScene;
        cs.dist = totalDistance;
    }
      
    cs.dist = totalDistance;
    hit.surface = cs;
    hit.near = ns;

    return hit;
}

float calcAO(vec3 p, vec3 n) 
{
    float k = 1.0;
    float occ = 0.0;
    for(int i = 0; i < 5; i++) 
    {
        float len = .15 * (float(i) + 1.0);
        float distance = sdfScene(n * len + p);
        occ += (len - distance) * k;
        k *= 0.5;
    }
    return clamp(1.0 - occ, 0.0, 1.0);
}


vec3 calculatePointLight(vec3 position, vec3 normal, PointLight light)
{  
    vec3 lightDirection = normalize(light.position - position);

    // Diffuse
    float diffuse = max(dot(normal, lightDirection), 0.0);

    // Shadows
    if(areShadowsOn)
    {
        //Compare raymarch distance to light with distance to light
        //Need to move the position with the normal so raymarching doesn't stop immediately
        Hit hit = rayMarch(position + normal * SHADOW_JUMP_DISTANCE, lightDirection);
    
        if(hit.surface.dist < length(light.position - hit.surface.position)) // this might not be set
        {
            diffuse *= 0;//.1; // reduce brightness to 10% in shadow
        }
    }

    // Specular
    vec3 reflectDirection = reflect(-lightDirection, normal);

    float specular = 0.0;
    float specularPower = 32.0;

    if(diffuse > 0.0) 
    {
        specular = max(0.0, dot(reflectDirection, normalize(cameraPosition - normal)));
        specular = pow(specular, specularPower) * light.intensity;
    }

    return (diffuse + specular) * light.intensity * light.color; 
}

vec3 calculateDirectionalLight(vec3 position, vec3 normal, DirectionalLight light)
{
    // Ambient
    //float ambient = 0.15;//calcAO(position, normal);

    vec3 lightDirection = normalize(-light.direction);

    // Diffuse
    float diffuse = max(dot(normal, lightDirection), 0.0);

    // Shadows
    if(areShadowsOn)
    {
        //Compare raymarch distance to light with distance to light
        //Need to move the position with the normal so raymarching doesn't stop immediately
        Hit hit = rayMarch(position + normal * SHADOW_JUMP_DISTANCE, lightDirection);
    
        if(hit.surface.dist < MAX_DISTANCE)
        {
            diffuse *= 0;//.1; // reduce brightness to 10% in shadow
        }
    }

    // Specular
    vec3 reflectDirection = reflect(lightDirection, normal);

    float specular = 0.0;

    if(diffuse > 0.0) 
    {
        float specularPower = 64.0;

        vec3 viewDirection = normalize(cameraPosition - position);
        specular = pow(max(0.0, dot(viewDirection, reflectDirection)), specularPower);
    }

    //return (ambient + diffuse + specular) * light.intensity * light.color; 
    return (diffuse + specular) * light.intensity * light.color; 
}

vec3 shade(Surface surface) 
{
    vec3 position = surface.position;

    vec3 color = vec3(0.0);
    vec3 sceneColor = vec3(0.0);
    vec3 normal = calculateNormal(position);

    vec3 objColor = vec3(1, 0.96, .72);
    vec3 specularColor = vec3(1., .6, .6);

    DirectionalLight directionalLight;
    directionalLight.direction = vec3(0.0, -1.0, 1.0);
    directionalLight.intensity = 0.3;
    directionalLight.color = vec3(0.76, 0.77, 0.8); //moon color

    PointLight pointLight;
    pointLight.position = vec3(5.0, 5.0, 5.0);
    pointLight.intensity = 0.8;
    pointLight.color = vec3(0.8, 0.5, 0.5);

    
    // directional light
    color += calculateDirectionalLight(position, normal, directionalLight);

    // ambient
    //vec3 ambient = ambientLight.color * ambientLight.intensity * objColor;
    //float ao = calcAO(position, normal);


    //color += objColor * diffuse + specular + ambient * ao;
    
    return color;
}



void main()
{ 
    float aspect = resolution.x / resolution.y;
    float fov2 = radians(fov) / 2;

    // convert coords from [0,1] to [-1,1]
    vec2 uv = (texCoords - 0.5) * 2.0;
    uv.x *= aspect;

    // contribute up and right vectors
    vec2 offsets = uv * tan(fov2);

    float fPersp = 2.0;
    vec3 rayDirection = normalize(offsets.x * cameraRight + offsets.y * cameraUp + cameraForward * fPersp);

    // Raymarch
    Hit hit = rayMarch(cameraPosition, rayDirection);
    Surface surface = hit.surface;
    Surface near = hit.near;

    surface.position = cameraPosition + rayDirection * surface.dist;
      
    // color
    vec3 color = vec3(0.0);
      
    // emissive
    vec3 emissiveColor = vec3(1, 0.96, .72);
    float ea = 1.0; 
    float emissive = pow(near.dist + 2., -2.);
    color += emissive * emissiveColor;

    // no hit or too far
    if(surface.dist >= MAX_DISTANCE) 
    {
        vec3 bgColor = vec3(0.1);
        FragColor.rgb = color + bgColor;
        return;
    }

    //color += emissiveColor;
    color += shade(surface);


    // Gamma correction
	color = pow(color, vec3(1.0 / 2.2));

    // Display
    FragColor.rgb = color;
}