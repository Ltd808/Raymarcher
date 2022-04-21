#define _CRTDBG_MAP_ALLOC

#include <glad/glad.h>
#include <glm/glm.hpp>
#include <glm/gtc/matrix_transform.hpp>

#include "GLFW/glfw3.h"

#include <fstream>
#include <sstream>
#include <iostream>

// Window
GLFWwindow* window;
glm::vec2 resolution = glm::vec2(2560, 1440);

// Camera uniforms
glm::vec3 cameraPosition = glm::vec3(0.0f, 2.0f, -10.0f);
glm::vec3 cameraForward = glm::vec3(0.0f, 0.0f, 1.0f);
glm::vec3 cameraRight = glm::vec3(1.0f, 0.0f, 0.0f);
glm::vec3 cameraUp = glm::vec3(0.0f, 1.0f, 0.0f);
float cameraFOV = 90.0f;

// Other camera vars
float cameraYaw = 90.0f;
float cameraPitch = 0.0f;
float cameraSpeed = 10.0f;
float cameraSensitivity = 10.0f;
bool firstClick = true;
double savedMouseX, savedMouseY;

// OpenGL
GLuint fullscreenShaderProgram;

// For debug context
void APIENTRY glDebugOutput(GLenum source, GLenum type, unsigned int id, GLenum severity, GLsizei length, const char* message, const void* userParam);

// For checking held down inputs, continuous call on hold
void ProcessInput(GLFWwindow* window, float deltaTime);

// Callback for window resize
void ResizeCallback(GLFWwindow* window, int width, int height);

// Callback for key presses, single call on press
void KeyCallback(GLFWwindow* window, int key, int scancode, int action, int mods);

// Callback for scroll
void ScrollCallback(GLFWwindow* window, double xoffset, double yoffset);

// Helper for loading shaders
std::string GetShaderSource(const char* shaderPath);

// utility function for checking shader compilation/linking errors
void CheckCompileErrors(unsigned int shader, std::string type);

// Helper for loading textures
//void LoadTexture

int main()
{
	// Check for memory leaks
	_CrtSetDbgFlag(_CRTDBG_ALLOC_MEM_DF | _CRTDBG_LEAK_CHECK_DF);

	// Initialize GLFW
	glfwInit();

	// Configure GLFW for OpenGL 4.6 Core
	glfwWindowHint(GLFW_CONTEXT_VERSION_MAJOR, 4);
	glfwWindowHint(GLFW_CONTEXT_VERSION_MINOR, 6);
	glfwWindowHint(GLFW_OPENGL_PROFILE, GLFW_OPENGL_CORE_PROFILE);
	glfwWindowHint(GLFW_OPENGL_DEBUG_CONTEXT, true); // Debug context, comment this out for better performance

	// Creating a window object
	window = glfwCreateWindow((int)resolution.x, (int)resolution.y, "OpenGL", NULL, NULL);
	if (window == NULL)
	{
		std::cout << "Failed to create GLFW window" << std::endl;
		glfwTerminate();
		return -1;
	}

	// Make window the current context
	glfwMakeContextCurrent(window);

	// Set GLFW callback functions
	glfwSetFramebufferSizeCallback(window, ResizeCallback);
	glfwSetKeyCallback(window, KeyCallback);
	glfwSetScrollCallback(window, ScrollCallback);

	// Initialize GLAD to load opengl function pointers
	if (!gladLoadGLLoader((GLADloadproc)glfwGetProcAddress))
	{
		std::cout << "Failed to initialize GLAD" << std::endl;
		return -1;
	}

	// Enable OpenGL debug context if context allows for debug context
	int flags; glGetIntegerv(GL_CONTEXT_FLAGS, &flags);
	if (flags & GL_CONTEXT_FLAG_DEBUG_BIT)
	{
		glEnable(GL_DEBUG_OUTPUT);
		glEnable(GL_DEBUG_OUTPUT_SYNCHRONOUS); // makes sure errors are displayed synchronously
		glDebugMessageCallback(glDebugOutput, nullptr);
		glDebugMessageControl(GL_DONT_CARE, GL_DONT_CARE, GL_DONT_CARE, 0, nullptr, GL_TRUE);
	}

	// Get shader source
	std::string vertexSource = GetShaderSource("Content/Shaders/Fullscreen.vert");
	std::string fragmentSource = GetShaderSource("Content/Shaders/Fullscreen.frag");

	const char* v = vertexSource.c_str();
	const char* f = fragmentSource.c_str();

	// Compile shaders
	GLuint vertex, fragment;

	vertex = glCreateShader(GL_VERTEX_SHADER);
	glShaderSource(vertex, 1, &v, NULL);
	glCompileShader(vertex);
	CheckCompileErrors(vertex, "VERTEX");

	fragment = glCreateShader(GL_FRAGMENT_SHADER);
	glShaderSource(fragment, 1, &f, NULL);
	glCompileShader(fragment);
	CheckCompileErrors(fragment, "FRAGMENT");

	// Create and link shader program
	fullscreenShaderProgram = glCreateProgram();
	glAttachShader(fullscreenShaderProgram, vertex);
	glAttachShader(fullscreenShaderProgram, fragment);
	glLinkProgram(fullscreenShaderProgram);
	CheckCompileErrors(fullscreenShaderProgram, "PROGRAM");

	// cleanup shaders
	glDeleteShader(vertex);
	glDeleteShader(fragment);

	// Active the fullscreen (raymarching) shader program
	glUseProgram(fullscreenShaderProgram);

	// Set uniforms
	glUniform2fv(glGetUniformLocation(fullscreenShaderProgram, "resolution"), 1, &resolution[0]);

	// Have to bind VAO to draw
	GLuint VAO;
	glGenVertexArrays(1, &VAO);
	glBindVertexArray(VAO);

	// Variables to create periodic event for FPS display
	double intervalStoredFrameTime = 0.0;
	double lastFrameTime = 0.0;
	double currentFrameTime = 0.0;
	double deltaTime;
	double intervalDeltaTime;

	// Keeps track of the amount of frames in timeDiff
	unsigned int intervalFrameCount = 0;

	// Render loop
	while (!glfwWindowShouldClose(window))
	{
		// Timer
		// Get time
		currentFrameTime = glfwGetTime();

		// Maybe can combine these two
		// Interval timer for FPS and MS
		intervalDeltaTime = currentFrameTime - intervalStoredFrameTime; // time interval
		intervalFrameCount++;

		// Time since last frame
		deltaTime = currentFrameTime - lastFrameTime; // time since last frame
		lastFrameTime = currentFrameTime; 

		// Periodic event for FPS display
		if (intervalDeltaTime >= 1.0 / 30.0)
		{
			// Create new title
			std::string FPS = std::to_string(intervalFrameCount / intervalDeltaTime);
			std::string ms = std::to_string((intervalDeltaTime / intervalFrameCount) * 1000);
			std::string newTitle = "OpenGL - FPS: " + FPS + " | MS:" + ms;
			glfwSetWindowTitle(window, newTitle.c_str());

			// Store time and reset counter
			intervalStoredFrameTime = currentFrameTime;
			intervalFrameCount = 0;
		}

		// Input
		ProcessInput(window, (float)deltaTime);

		// Update
		//view = glm::lookAt(cameraPosition, cameraPosition + cameraForward, cameraUp);

		// Set uniforms
		glUniform3fv(glGetUniformLocation(fullscreenShaderProgram, "cameraPosition"), 1, &cameraPosition[0]);
		glUniform3fv(glGetUniformLocation(fullscreenShaderProgram, "cameraForward"), 1, &cameraForward[0]);
		glUniform3fv(glGetUniformLocation(fullscreenShaderProgram, "cameraRight"), 1, &cameraRight[0]);
		glUniform3fv(glGetUniformLocation(fullscreenShaderProgram, "cameraUp"), 1, &cameraUp[0]);
		glUniform1f(glGetUniformLocation(fullscreenShaderProgram, "fov"), cameraFOV);

		glUniform1f(glGetUniformLocation(fullscreenShaderProgram, "time"), currentFrameTime);

		// Clear framebuffer
		glClearColor(0.1f, 0.1f, 0.1f, 1.0f);
		glClear(GL_COLOR_BUFFER_BIT);

		// Draw the universe quad
		glDrawArrays(GL_TRIANGLES, 0, 3); // Attributeless call :)

		// Swap front and back buffers
		glfwSwapBuffers(window);

		// Poll GLFW events, input
		glfwPollEvents();
	}

	// Delete window resources
	glfwDestroyWindow(window);

	// Delete GLFW resources
	glfwTerminate();

	return 0;
}

std::string GetShaderSource(const char* shaderPath)
{
	// Get source code from path
	std::string shaderCode;
	std::ifstream shaderFile;

	// Set ifstream objects' exceptions
	shaderFile.exceptions(std::ifstream::failbit | std::ifstream::badbit);

	try
	{
		// Open files
		shaderFile.open(shaderPath);
		std::stringstream shaderStream;
		// Read file's buffer contents into streams
		shaderStream << shaderFile.rdbuf();
		// Close file handlers
		shaderFile.close();
		// Convert stream into string
		shaderCode = shaderStream.str();
	}
	catch (std::ifstream::failure& e)
	{
		std::cout << "SHADER NOT SUCCESSFULLY READ" << std::endl;
	}

	return shaderCode;
}

void ProcessInput(GLFWwindow* window, float deltaTime)
{
	// Escape closes window
	if (glfwGetKey(window, GLFW_KEY_ESCAPE) == GLFW_PRESS)
	{
		glfwSetWindowShouldClose(window, true);
	}

	if (glfwGetKey(window, GLFW_KEY_W) == GLFW_PRESS)
	{
		cameraPosition += cameraForward * cameraSpeed * deltaTime;
	}

	if (glfwGetKey(window, GLFW_KEY_S) == GLFW_PRESS)
	{
		cameraPosition -= cameraForward * cameraSpeed * deltaTime;
	}

	if (glfwGetKey(window, GLFW_KEY_A) == GLFW_PRESS)
	{
		cameraPosition -= cameraRight * cameraSpeed * deltaTime;
	}

	if (glfwGetKey(window, GLFW_KEY_D) == GLFW_PRESS)
	{
		cameraPosition += cameraRight * cameraSpeed * deltaTime;
	}

	if (glfwGetKey(window, GLFW_KEY_SPACE) == GLFW_PRESS)
	{
		cameraPosition += cameraUp * cameraSpeed * deltaTime;
	}

	if (glfwGetKey(window, GLFW_KEY_LEFT_CONTROL) == GLFW_PRESS)
	{
		cameraPosition -= cameraUp * cameraSpeed * deltaTime;
	}

	if (glfwGetMouseButton(window, GLFW_MOUSE_BUTTON_LEFT) == GLFW_PRESS)
	{
		if (firstClick)
		{
			// Save original cursor pos
			glfwGetCursorPos(window, &savedMouseX, &savedMouseY);
			firstClick = false;
			glfwSetInputMode(window, GLFW_CURSOR, GLFW_CURSOR_DISABLED);
		}
		else
		{
			double mouseX;
			double mouseY;
			glfwGetCursorPos(window, &mouseX, &mouseY);

			float xoffset = (mouseX - savedMouseX) * cameraSensitivity * deltaTime;
			float yoffset = (savedMouseY - mouseY) * cameraSensitivity * deltaTime;

			cameraYaw += xoffset;
			cameraPitch += yoffset;

			// make sure that when pitch is out of bounds, screen doesn't get flipped
			if (cameraPitch > 89.0f)
			{
				cameraPitch = 89.0f;
			}
			if (cameraPitch < -89.0f)
			{
				cameraPitch = -89.0f;
			}

			// Calculate new forward vector
			glm::vec3 forward;
			forward.x = cos(glm::radians(cameraYaw)) * cos(glm::radians(cameraPitch));
			forward.y = sin(glm::radians(cameraPitch));
			forward.z = sin(glm::radians(cameraYaw)) * cos(glm::radians(cameraPitch));
			cameraForward = glm::normalize(forward);

			// Re-calculate the Right and Up vector
			cameraRight = glm::normalize(glm::cross(cameraForward, glm::vec3(0, 1, 0))); 
			cameraUp = glm::normalize(glm::cross(cameraRight, cameraForward));

			// Set cursor to saved
			glfwSetCursorPos(window, savedMouseX, savedMouseY);
		}
	}
	else if (glfwGetMouseButton(window, GLFW_MOUSE_BUTTON_LEFT) == GLFW_RELEASE)
	{
		// tell GLFW to not capture our mouse
		glfwSetInputMode(window, GLFW_CURSOR, GLFW_CURSOR_NORMAL);
		if (!firstClick)
		{
			firstClick = true;
		}
	}
}


void ResizeCallback(GLFWwindow* window, int width, int height)
{
	// Store
	resolution = glm::vec2(width, height);

	// Update uniform
	glUniform2fv(glGetUniformLocation(fullscreenShaderProgram, "resolution"), 1, &resolution[0]);

	// Update OpenGL
	glViewport(0, 0, width, height);
}

void KeyCallback(GLFWwindow* window, int key, int scancode, int action, int mods)
{
	// Good for single button press
}


void ScrollCallback(GLFWwindow* window, double xoffset, double yoffset)// **find out what xoffset is for at some point**
{
	//Set speed with vertical scroll
	float newSpeed = cameraSpeed + (float)yoffset;

	if (newSpeed < 0.1f)
	{
		cameraSpeed = 0.1f;
	}
	else if (newSpeed > 10.0f)
	{
		cameraSpeed = 10.0f;
	}
}

void APIENTRY glDebugOutput(GLenum source,
	GLenum type,
	unsigned int id,
	GLenum severity,
	GLsizei length,
	const char* message,
	const void* userParam)
{
	if (id == 131169 || id == 131185 || id == 131218 || id == 131204) return; // ignore these non-significant error codes

	std::cout << "---------------" << std::endl;
	std::cout << "Debug message (" << id << "): " << message << std::endl;

	switch (source)
	{
	case GL_DEBUG_SOURCE_API:             std::cout << "Source: API"; break;
	case GL_DEBUG_SOURCE_WINDOW_SYSTEM:   std::cout << "Source: Window System"; break;
	case GL_DEBUG_SOURCE_SHADER_COMPILER: std::cout << "Source: Shader Compiler"; break;
	case GL_DEBUG_SOURCE_THIRD_PARTY:     std::cout << "Source: Third Party"; break;
	case GL_DEBUG_SOURCE_APPLICATION:     std::cout << "Source: Application"; break;
	case GL_DEBUG_SOURCE_OTHER:           std::cout << "Source: Other"; break;
	} std::cout << std::endl;

	switch (type)
	{
	case GL_DEBUG_TYPE_ERROR:               std::cout << "Type: Error"; break;
	case GL_DEBUG_TYPE_DEPRECATED_BEHAVIOR: std::cout << "Type: Deprecated Behaviour"; break;
	case GL_DEBUG_TYPE_UNDEFINED_BEHAVIOR:  std::cout << "Type: Undefined Behaviour"; break;
	case GL_DEBUG_TYPE_PORTABILITY:         std::cout << "Type: Portability"; break;
	case GL_DEBUG_TYPE_PERFORMANCE:         std::cout << "Type: Performance"; break;
	case GL_DEBUG_TYPE_MARKER:              std::cout << "Type: Marker"; break;
	case GL_DEBUG_TYPE_PUSH_GROUP:          std::cout << "Type: Push Group"; break;
	case GL_DEBUG_TYPE_POP_GROUP:           std::cout << "Type: Pop Group"; break;
	case GL_DEBUG_TYPE_OTHER:               std::cout << "Type: Other"; break;
	} std::cout << std::endl;

	switch (severity)
	{
	case GL_DEBUG_SEVERITY_HIGH:         std::cout << "Severity: high"; break;
	case GL_DEBUG_SEVERITY_MEDIUM:       std::cout << "Severity: medium"; break;
	case GL_DEBUG_SEVERITY_LOW:          std::cout << "Severity: low"; break;
	case GL_DEBUG_SEVERITY_NOTIFICATION: std::cout << "Severity: notification"; break;
	} std::cout << std::endl;
	std::cout << std::endl;
}

void CheckCompileErrors(unsigned int shader, std::string type)
{
	int success;
	char infoLog[1024];
	if (type != "PROGRAM")
	{
		glGetShaderiv(shader, GL_COMPILE_STATUS, &success);
		if (!success)
		{
			glGetShaderInfoLog(shader, 1024, NULL, infoLog);
			std::cout << "ERROR::SHADER_COMPILATION_ERROR of type: " << type << "\n" << infoLog << "\n -- --------------------------------------------------- -- " << std::endl;
		}
	}
	else
	{
		glGetProgramiv(shader, GL_LINK_STATUS, &success);
		if (!success)
		{
			glGetProgramInfoLog(shader, 1024, NULL, infoLog);
			std::cout << "ERROR::PROGRAM_LINKING_ERROR of type: " << type << "\n" << infoLog << "\n -- --------------------------------------------------- -- " << std::endl;
		}
	}
}

