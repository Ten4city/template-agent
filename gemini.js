/**
 * Gemini/Vertex AI Adapter
 *
 * Provides Gemini model support via Vertex AI with function calling.
 */

import { VertexAI } from "@google-cloud/vertexai";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { SYSTEM_PROMPT } from "./prompt.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load service account
const serviceAccountPath = path.join(__dirname, "service-account.json");

/**
 * Convert our tool definitions to Gemini function declarations
 */
function convertToolsToGemini(tools) {
  return tools.map(tool => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.input_schema
  }));
}

/**
 * Create Gemini client with Vertex AI
 */
function createGeminiClient() {
  // Set credentials via environment variable
  process.env.GOOGLE_APPLICATION_CREDENTIALS = serviceAccountPath;

  const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf-8"));

  const vertexAI = new VertexAI({
    project: serviceAccount.project_id,
    location: "us-central1"
  });

  return vertexAI;
}

/**
 * Run agent loop with Gemini
 */
export async function runGeminiAgent(imagePath, textBlocks, tools, executor, options = {}) {
  const { maxIterations = 100, verbose = true, model = "gemini-2.0-flash-001" } = options;

  const vertexAI = createGeminiClient();

  const generativeModel = vertexAI.getGenerativeModel({
    model,
    generationConfig: {
      maxOutputTokens: 8192,
      temperature: 0.1
    },
    tools: [{
      functionDeclarations: convertToolsToGemini(tools)
    }],
    systemInstruction: SYSTEM_PROMPT
  });

  // Load image as base64
  const imageBuffer = fs.readFileSync(imagePath);
  const imageBase64 = imageBuffer.toString("base64");
  const mimeType = imagePath.endsWith(".png") ? "image/png" : "image/jpeg";

  // Build text blocks preview
  const blocksPreview = textBlocks
    .map((b, i) => `[${i}] (${b.type}) ${b.text.substring(0, 80)}${b.text.length > 80 ? "..." : ""}`)
    .join("\n");

  // Initial message
  const initialContent = [
    {
      inlineData: {
        mimeType,
        data: imageBase64
      }
    },
    {
      text: `## TEXT BLOCKS AVAILABLE
The following text blocks were extracted from the document. Use search_block(hint) to find the right block, then use block_index in tools.

${blocksPreview}

## TASK
Recreate this document page as HTML. Focus on matching the visual layout from the image while using text blocks for content.

Start by using think() to analyze the page structure, then build it section by section.
Call finish_page() when complete.`
    }
  ];

  // Start chat session
  const chat = generativeModel.startChat({
    history: []
  });

  let iterations = 0;

  if (verbose) {
    console.log(`[Gemini] Starting with ${textBlocks.length} text blocks`);
  }

  // Send initial message
  let response = await chat.sendMessage(initialContent);

  while (!executor.isFinished() && iterations < maxIterations) {
    iterations++;

    const candidate = response.response.candidates?.[0];
    if (!candidate) {
      console.log("[Gemini] No candidate in response");
      break;
    }

    const content = candidate.content;
    const parts = content.parts || [];

    // Check for function calls
    const functionCalls = parts.filter(p => p.functionCall);

    if (functionCalls.length === 0) {
      // No function calls - check if there's text (model might be done or confused)
      const textParts = parts.filter(p => p.text);
      if (textParts.length > 0 && verbose) {
        console.log(`[Gemini:${iterations}] Text: ${textParts[0].text?.substring(0, 100)}...`);
      }

      if (candidate.finishReason === "STOP") {
        if (verbose) console.log("[Gemini] Model stopped without finish_page");
        break;
      }

      // Prompt to continue
      response = await chat.sendMessage([{ text: "Continue with the next tool call." }]);
      continue;
    }

    // Execute function calls
    const functionResponses = [];

    for (const part of functionCalls) {
      const fc = part.functionCall;
      const toolName = fc.name;
      const toolArgs = fc.args || {};

      if (verbose) {
        if (toolName === "think") {
          console.log(`[Gemini:${iterations}] think: ${toolArgs.reasoning?.substring(0, 100)}...`);
        } else {
          console.log(`[Gemini:${iterations}] ${toolName}(${JSON.stringify(toolArgs).substring(0, 60)}...)`);
        }
      }

      const result = executor.execute(toolName, toolArgs);

      if (verbose && result.error) {
        console.log(`  ↳ ERROR: ${result.error}`);
      }

      functionResponses.push({
        functionResponse: {
          name: toolName,
          response: result
        }
      });
    }

    // Send function responses back
    response = await chat.sendMessage(functionResponses);
  }

  if (verbose) {
    console.log(`[Gemini] Completed in ${iterations} iterations`);
    console.log(`[Gemini] HTML output: ${executor.getOutput().length} chars`);
  }

  return {
    html: executor.getFullOutput(),
    iterations,
    finished: executor.isFinished()
  };
}
