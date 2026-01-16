/**
 * Edit Agent
 *
 * Runs the editing loop using Gemini 2.5 Pro.
 * Takes a structure, selection, and user prompt, returns edited structure.
 */

import { VertexAI } from '@google-cloud/vertexai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { StructureEditor } from './structure-editor.js';
import { EDIT_TOOLS, convertToolsToGemini } from './edit-tools.js';
import { EDIT_SYSTEM_PROMPT } from './edit-prompt.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Service account path - same as reconstruction extractor
const serviceAccountPath = '/Users/ritik/Downloads/internal-operations-461404-316ec7fe1406 (3).json';

/**
 * Create Gemini client via Vertex AI
 */
function createGeminiClient() {
  process.env.GOOGLE_APPLICATION_CREDENTIALS = serviceAccountPath;

  const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf-8'));

  const vertexAI = new VertexAI({
    project: serviceAccount.project_id,
    location: 'us-central1',
  });

  return vertexAI;
}

/**
 * Build context message for the LLM
 */
function buildContextMessage(structure, selection, userPrompt) {
  const selectedElement = structure.pages[0]?.elements[selection.elementIndex];

  if (!selectedElement) {
    throw new Error(`Element ${selection.elementIndex} not found`);
  }

  // Get column count for context
  let columnInfo = '';
  if (selectedElement.type === 'table') {
    const declaredCols = selectedElement.columns;
    const actualCols = selectedElement.rows?.[0]?.length || 0;
    columnInfo = `\nTable has ${declaredCols || actualCols} columns and ${selectedElement.rows?.length || 0} rows.`;
    if (selectedElement.bordered !== undefined) {
      columnInfo += ` Bordered: ${selectedElement.bordered}`;
    }
  }

  return `## Current Structure

Element ${selection.elementIndex} (${selectedElement.type}):${columnInfo}

\`\`\`json
${JSON.stringify(selectedElement, null, 2)}
\`\`\`

## Selection

${JSON.stringify(selection, null, 2)}

## User Request

${userPrompt}`;
}

/**
 * Run the edit agent
 *
 * @param {Object} structure - Document structure JSON
 * @param {Object} selection - Selection info {type, elementIndex, cells?, startRow?, etc.}
 * @param {string} userPrompt - User's edit instruction
 * @param {Object} options - {verbose: boolean, maxIterations: number}
 * @returns {Object} {editedStructure, toolsUsed, iterations, summary}
 */
export async function runEditAgent(structure, selection, userPrompt, options = {}) {
  const { verbose = true, maxIterations = 10, model = 'gemini-2.5-pro' } = options;

  const vertexAI = createGeminiClient();

  const generativeModel = vertexAI.getGenerativeModel({
    model,
    generationConfig: {
      maxOutputTokens: 4096,
      temperature: 0.1,
    },
    tools: [
      {
        functionDeclarations: convertToolsToGemini(EDIT_TOOLS),
      },
    ],
    systemInstruction: EDIT_SYSTEM_PROMPT,
  });

  const editor = new StructureEditor(structure);
  const toolsUsed = [];
  let summary = '';

  // Build context message
  const contextMessage = buildContextMessage(structure, selection, userPrompt);

  if (verbose) {
    console.log('[EditAgent] Starting edit session');
    console.log(`[EditAgent] User prompt: ${userPrompt}`);
  }

  // Start chat session
  const chat = generativeModel.startChat({ history: [] });

  let finished = false;
  let iterations = 0;

  // Send initial message
  let response = await chat.sendMessage([{ text: contextMessage }]);

  while (!finished && iterations < maxIterations) {
    iterations++;

    const candidate = response.response.candidates?.[0];
    if (!candidate) {
      if (verbose) console.log('[EditAgent] No candidate in response');
      break;
    }

    const content = candidate.content;
    const parts = content.parts || [];

    // Check for function calls
    const functionCalls = parts.filter((p) => p.functionCall);

    if (functionCalls.length === 0) {
      // No function calls - model might be done
      const textParts = parts.filter((p) => p.text);
      if (textParts.length > 0 && verbose) {
        console.log(`[EditAgent:${iterations}] Text: ${textParts[0].text?.substring(0, 100)}...`);
      }

      if (candidate.finishReason === 'STOP') {
        if (verbose) console.log('[EditAgent] Model stopped');
        break;
      }

      // Prompt to continue
      response = await chat.sendMessage([{ text: 'Continue with the edit or call finish_edit().' }]);
      continue;
    }

    // Execute function calls
    const functionResponses = [];

    for (const part of functionCalls) {
      const fc = part.functionCall;
      const toolName = fc.name;
      const toolArgs = fc.args || {};

      if (verbose) {
        if (toolName === 'think') {
          console.log(`[EditAgent:${iterations}] think: ${toolArgs.reasoning?.substring(0, 100)}...`);
        } else {
          console.log(`[EditAgent:${iterations}] ${toolName}(${JSON.stringify(toolArgs)})`);
        }
      }

      // Handle control tools
      if (toolName === 'finish_edit') {
        finished = true;
        summary = toolArgs.summary || 'Edit completed';
        functionResponses.push({
          functionResponse: {
            name: toolName,
            response: { success: true },
          },
        });
        break;
      }

      if (toolName === 'think') {
        functionResponses.push({
          functionResponse: {
            name: toolName,
            response: { acknowledged: true },
          },
        });
        continue;
      }

      // Execute editing tool
      if (typeof editor[toolName] === 'function') {
        toolsUsed.push(toolName);
        const result = editor[toolName](toolArgs);

        if (verbose) {
          if (result.success) {
            console.log(`  -> ${result.message || 'OK'}`);
          } else {
            console.log(`  -> ERROR: ${result.error}`);
          }
        }

        functionResponses.push({
          functionResponse: {
            name: toolName,
            response: result,
          },
        });
      } else {
        functionResponses.push({
          functionResponse: {
            name: toolName,
            response: { success: false, error: `Unknown tool: ${toolName}` },
          },
        });
      }
    }

    // Send function responses back
    if (!finished && functionResponses.length > 0) {
      response = await chat.sendMessage(functionResponses);
    }
  }

  // Validate final structure
  const validationErrors = editor.validate();
  if (validationErrors.length > 0 && verbose) {
    console.log('[EditAgent] Validation warnings:', validationErrors);
  }

  if (verbose) {
    console.log(`[EditAgent] Completed in ${iterations} iterations`);
    console.log(`[EditAgent] Tools used: ${[...new Set(toolsUsed)].join(', ') || 'none'}`);
    console.log(`[EditAgent] Summary: ${summary}`);
  }

  return {
    editedStructure: editor.getStructure(),
    toolsUsed: [...new Set(toolsUsed)],
    iterations,
    summary,
    validationErrors,
  };
}
