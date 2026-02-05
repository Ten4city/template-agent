/**
 * CKEditor Agent
 *
 * Runs the editing loop using Gemini.
 * Takes HTML content, selection info, and user prompt.
 * Returns a list of commands to be executed by the frontend.
 */

import { VertexAI } from '@google-cloud/vertexai';
import fs from 'fs';
import { CKEDITOR_TOOLS, toGeminiFunctionDeclarations, CKEDITOR_SYSTEM_PROMPT } from './ckeditor-tools.js';

// Service account: from GOOGLE_CREDENTIALS env var (JSON string) or file path
const SERVICE_ACCOUNT_PATH = process.env.SERVICE_ACCOUNT_PATH || './service-account.json';

// Cache for service account
let serviceAccount = null;

/**
 * Get service account data
 */
function getServiceAccount() {
  if (!serviceAccount) {
    if (process.env.GOOGLE_CREDENTIALS) {
      serviceAccount = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    } else {
      serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf-8'));
    }
  }
  return serviceAccount;
}

/**
 * Create Gemini client via Vertex AI
 */
function createGeminiClient() {
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
 * Build context message for the AI
 */
function buildContextMessage(html, selection, userPrompt) {
  let selectionContext = '';

  if (selection.hasSelection && selection.text) {
    selectionContext = `
## Selected Content

Text: "${selection.text}"
${selection.html && selection.html !== selection.text ? `HTML: ${selection.html}` : ''}
Container element: <${selection.startElement || 'unknown'}>
${selection.tableContext?.inTable ? `In table: Yes (cell tag: ${selection.tableContext.cellTag})` : ''}`;
  } else {
    selectionContext = `
## Selection

No text selected. Cursor is at a position in the document.
${selection.startElement ? `Current element: <${selection.startElement}>` : ''}`;
  }

  // Truncate HTML if too long (keep first 8000 chars)
  const truncatedHtml = html.length > 8000 ? html.substring(0, 8000) + '\n... (truncated)' : html;

  return `## Document HTML

\`\`\`html
${truncatedHtml}
\`\`\`

${selectionContext}

## User Request

${userPrompt}`;
}

/**
 * Run the CKEditor agent
 *
 * @param {string} html - Full document HTML from CKEditor
 * @param {Object} selection - Selection info {text, html, hasSelection, startElement, tableContext}
 * @param {string} userPrompt - User's edit instruction
 * @param {Object} options - {verbose: boolean, maxIterations: number}
 * @returns {Object} {commands: [], summary: string, iterations: number}
 */
export async function runCKEditorAgent(html, selection, userPrompt, options = {}) {
  const { verbose = true, maxIterations = 10, model = 'gemini-2.5-flash-preview-05-20' } = options;

  const vertexAI = createGeminiClient();

  const generativeModel = vertexAI.getGenerativeModel({
    model,
    generationConfig: {
      maxOutputTokens: 4096,
      temperature: 0.1,
    },
    tools: [
      {
        functionDeclarations: toGeminiFunctionDeclarations(CKEDITOR_TOOLS),
      },
    ],
    systemInstruction: CKEDITOR_SYSTEM_PROMPT,
  });

  const commands = [];
  const toolsUsed = [];
  let summary = '';
  let finished = false;
  let iterations = 0;

  // Build initial context
  const contextMessage = buildContextMessage(html, selection, userPrompt);

  if (verbose) {
    console.log('[CKEditorAgent] Starting edit session');
    console.log('[CKEditorAgent] User prompt:', userPrompt);
  }

  // Start chat session
  const chat = generativeModel.startChat({ history: [] });

  // Send initial message
  let response = await chat.sendMessage([{ text: contextMessage }]);

  while (!finished && iterations < maxIterations) {
    iterations++;

    // Extract function calls from response
    const candidate = response.response.candidates?.[0];
    const content = candidate?.content;
    const parts = content?.parts || [];

    const functionCalls = parts.filter((p) => p.functionCall).map((p) => p.functionCall);

    if (functionCalls.length === 0) {
      // No function calls - check if finished naturally
      const finishReason = candidate?.finishReason;
      if (finishReason === 'STOP') {
        if (verbose) console.log('[CKEditorAgent] Model finished without explicit finish_edit');
        break;
      }

      // Prompt to continue
      if (verbose) console.log('[CKEditorAgent] No function calls, prompting to continue...');
      response = await chat.sendMessage([
        { text: 'Please use the available tools to complete the edit, then call finish_edit.' },
      ]);
      continue;
    }

    // Process function calls
    const functionResponses = [];

    for (const fc of functionCalls) {
      const toolName = fc.name;
      const toolArgs = fc.args || {};

      if (verbose) {
        console.log(`[CKEditorAgent] Tool: ${toolName}(${JSON.stringify(toolArgs)})`);
      }

      // Handle control tools
      if (toolName === 'finish_edit') {
        finished = true;
        summary = toolArgs.summary || 'Edit completed';
        functionResponses.push({
          functionResponse: {
            name: toolName,
            response: { success: true, message: 'Edit session completed' },
          },
        });
        break;
      }

      if (toolName === 'think') {
        if (verbose) console.log(`[CKEditorAgent] Thinking: ${toolArgs.reasoning}`);
        functionResponses.push({
          functionResponse: {
            name: toolName,
            response: { acknowledged: true },
          },
        });
        continue;
      }

      // Record command (will be executed on frontend)
      commands.push({
        tool: toolName,
        args: toolArgs,
        order: commands.length,
      });
      toolsUsed.push(toolName);

      // Respond with success (command will execute on frontend)
      functionResponses.push({
        functionResponse: {
          name: toolName,
          response: {
            success: true,
            message: `Command queued: ${toolName}`,
            willExecuteOnFrontend: true,
          },
        },
      });
    }

    // Send function responses back if not finished
    if (!finished && functionResponses.length > 0) {
      response = await chat.sendMessage(functionResponses);
    }
  }

  if (verbose) {
    console.log(`[CKEditorAgent] Completed in ${iterations} iterations`);
    console.log(`[CKEditorAgent] Commands: ${commands.length}`);
    console.log(`[CKEditorAgent] Summary: ${summary}`);
  }

  return {
    commands,
    toolsUsed: [...new Set(toolsUsed)], // Unique tools
    summary,
    iterations,
  };
}
