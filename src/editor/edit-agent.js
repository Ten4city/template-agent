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

// Service account: from GOOGLE_CREDENTIALS env var (JSON string) or file path
const SERVICE_ACCOUNT_PATH = process.env.SERVICE_ACCOUNT_PATH || './service-account.json';

// Cache for service account
let serviceAccount = null;

/**
 * Get service account data
 */
function getServiceAccount() {
  if (!serviceAccount) {
    // First try environment variable (for cloud deployments)
    if (process.env.GOOGLE_CREDENTIALS) {
      serviceAccount = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    } else {
      // Fall back to file (for local development)
      serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf-8'));
    }
  }
  return serviceAccount;
}

/**
 * Create Gemini client via Vertex AI
 */
function createGeminiClient() {
  // Only set GOOGLE_APPLICATION_CREDENTIALS if using file-based auth
  if (!process.env.GOOGLE_CREDENTIALS) {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = SERVICE_ACCOUNT_PATH;
  }

  const sa = getServiceAccount();

  const vertexAI = new VertexAI({
    project: sa.project_id,
    location: 'us-central1',
  });

  return vertexAI;
}

/**
 * Build context message for the LLM
 */
function buildContextMessage(structure, selection, userPrompt) {
  // Find the correct page using pageNumber from selection
  const pageNumber = selection.pageNumber || 1;
  const page = structure.pages.find((p) => p.pageNumber === pageNumber);

  if (!page) {
    throw new Error(`Page ${pageNumber} not found`);
  }

  const selectedElement = page.elements[selection.elementIndex];

  if (!selectedElement) {
    throw new Error(`Element ${selection.elementIndex} not found on page ${pageNumber}`);
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

Page ${pageNumber}, Element ${selection.elementIndex} (${selectedElement.type}):${columnInfo}

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
  const { verbose = true, maxIterations = 10, model = 'gemini-2.5-flash' } = options;

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

  const pageNumber = selection.pageNumber || 1;
  const editor = new StructureEditor(structure, pageNumber);
  const toolsUsed = [];
  let summary = '';

  // Build context message
  const contextMessage = buildContextMessage(structure, selection, userPrompt);

  if (verbose) {
    console.log('[EditAgent] Starting edit session');
    console.log(`[EditAgent] User prompt: ${userPrompt}`);
    console.log(`[EditAgent] Pages in structure: ${structure.pages.map(p => p.pageNumber).join(', ')}`);
    console.log(`[EditAgent] Selection: pageNumber=${selection.pageNumber}, elementIndex=${selection.elementIndex}`);
    const debugPage = structure.pages.find(p => p.pageNumber === (selection.pageNumber || 1));
    console.log(`[EditAgent] Found page: ${debugPage ? debugPage.pageNumber : 'none'}, elements: ${debugPage?.elements?.length || 0}`);
    if (debugPage?.elements?.[selection.elementIndex]) {
      console.log(`[EditAgent] Element type: ${debugPage.elements[selection.elementIndex].type}`);
    }
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
