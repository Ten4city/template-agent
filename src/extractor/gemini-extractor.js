/**
 * Gemini LLM Extractor
 *
 * Takes page image + text blocks → outputs Semantic IR
 * Uses Gemini 2.5 Pro via Vertex AI
 */

import { VertexAI } from '@google-cloud/vertexai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { EXTRACTION_SYSTEM_PROMPT, EXTRACTION_TOOLS } from './prompt.js';
import { validatePageIR } from '../schema/validator.js';
import { buildRowContext } from '../layout/index.js';

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
    if (process.env.GOOGLE_CREDENTIALS) {
      serviceAccount = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    } else {
      serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf-8'));
    }
  }
  return serviceAccount;
}

/**
 * Convert tool definitions to Gemini function declarations
 */
function convertToolsToGemini(tools) {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.input_schema,
  }));
}

/**
 * Create Gemini client with Vertex AI
 */
function createGeminiClient() {
  if (!process.env.GOOGLE_CREDENTIALS) {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = SERVICE_ACCOUNT_PATH;
  }

  const sa = getServiceAccount();

  return new VertexAI({
    project: sa.project_id,
    location: 'us-central1',
  });
}

/**
 * Extract IR from a single page using Gemini
 * @param {string} imagePath - Path to page image (PNG)
 * @param {Object} options - Configuration options
 * @param {Object} options.layoutData - Pre-processed layout data (rows, controls, blocks)
 * @returns {Promise<Object>} - { pageIR, iterations, valid, errors }
 */
export async function extractPageIRGemini(imagePath, options = {}) {
  const {
    pageNumber = 1,
    maxIterations = 30,
    model = 'gemini-2.5-pro',
    verbose = false,
    layoutData = null,
  } = options;

  // Get text blocks from layout data (PyMuPDF extraction)
  const textBlocks = layoutData?.text?.blocks || [];

  const vertexAI = createGeminiClient();

  const generativeModel = vertexAI.getGenerativeModel({
    model,
    generationConfig: {
      maxOutputTokens: 16384,
      temperature: 0.1,
    },
    tools: [
      {
        functionDeclarations: convertToolsToGemini(EXTRACTION_TOOLS),
      },
    ],
    systemInstruction: EXTRACTION_SYSTEM_PROMPT,
  });

  // Load image as base64
  const imageBuffer = fs.readFileSync(imagePath);
  const imageBase64 = imageBuffer.toString('base64');
  const mimeType = imagePath.endsWith('.png') ? 'image/png' : 'image/jpeg';

  // Build row context from layout data (if available)
  const rowContext = layoutData ? buildRowContext(layoutData) : null;

  // Debug: Log visual_structure
  if (verbose && rowContext?.visual_structure) {
    console.log('[Gemini] Visual structure:', JSON.stringify(rowContext.visual_structure, null, 2));
  }

  // Build text blocks preview for LLM context
  const blockPreview = textBlocks
    .map((b) => {
      const preview = b.text.length > 80 ? b.text.substring(0, 80) + '...' : b.text;
      const type = b.is_bold ? 'bold' : 'text';
      return `[${b.id}] (${type}) ${preview}`;
    })
    .join('\n');

  // Build the context section based on available data
  let contextSection;
  if (rowContext) {
    // Use structured row context
    contextSection = `## PRE-PROCESSED LAYOUT

Page type: ${rowContext.page_type}
${rowContext.page_type === 'form' ? `Rows: ${rowContext.row_count}, Row Groups: ${rowContext.row_group_count || 0}, Controls: ${rowContext.control_count}` : `Columns: ${rowContext.column_count}, Multi-column: ${rowContext.is_multi_column}`}

${rowContext.page_type === 'form' && rowContext.rows ? `### VISUAL STRUCTURE (from line detection)
${rowContext.visual_structure ? JSON.stringify(rowContext.visual_structure, null, 2) : 'No visual structure detected'}

### ROW GROUPS (consecutive rows forming logical units)
${rowContext.row_groups && rowContext.row_groups.length > 0 ? JSON.stringify(rowContext.row_groups, null, 2) : 'No row groups detected - process rows individually'}

### ROWS (pre-grouped by spatial proximity)
${JSON.stringify(rowContext.rows, null, 2)}

### CONTROLS (detected checkboxes/radio buttons)
${JSON.stringify(rowContext.controls, null, 2)}
` : ''}
### BLOCKS (for text lookup)
${JSON.stringify(rowContext.blocks, null, 2)}

## AVAILABLE TEXT BLOCKS (from document)

${blockPreview}`;
  } else {
    // Fallback to original block-only context
    contextSection = `## AVAILABLE TEXT BLOCKS

The following text blocks were extracted from the document. Use search_block to find the right index, then include blockIndex in your IR.

${blockPreview}`;
  }

  // Initial message
  const initialContent = [
    {
      inlineData: {
        mimeType,
        data: imageBase64,
      },
    },
    {
      text: `## PAGE ${pageNumber}

Analyze this document page and output a Semantic IR representation.

${contextSection}

## TASK

${rowContext ? `1. READ the pre-processed row structure (rows are pre-grouped)
2. VERIFY against the image (rows may have errors - you can override if visually wrong)
3. MAP rows to section types:
   - header row → section-header
   - label-value rows → input-grid rows
   - option-row with controls → checkbox/radio fields
4. Search for text blocks to get blockIndex values
5. Output the complete PageIR using output_page_ir tool` : `1. Observe the page structure carefully
2. Identify each section and its type
3. Search for text blocks to get blockIndex values
4. Output the complete PageIR using output_page_ir tool`}

Start by analyzing the ${rowContext ? 'row structure and ' : ''}visible structure, then build the IR.`,
    },
  ];

  // Start chat session
  const chat = generativeModel.startChat({ history: [] });

  let iterations = 0;
  let pageIR = null;

  if (verbose) {
    console.log(`\n[Gemini] Starting extraction for page ${pageNumber}`);
    console.log(`[Gemini] Model: ${model}`);
    console.log(`[Gemini] Text blocks available: ${textBlocks.length}`);
  }

  // Send initial message
  let response = await chat.sendMessage(initialContent);

  while (iterations < maxIterations) {
    iterations++;

    const candidate = response.response.candidates?.[0];
    if (!candidate) {
      if (verbose) console.log('[Gemini] No candidate in response');
      break;
    }

    const content = candidate.content;
    const parts = content.parts || [];

    // Check for function calls
    const functionCalls = parts.filter((p) => p.functionCall);

    if (functionCalls.length === 0) {
      // No function calls - check for text or stop
      const textParts = parts.filter((p) => p.text);
      if (textParts.length > 0 && verbose) {
        console.log(`  [${iterations}] Text: ${textParts[0].text?.substring(0, 100)}...`);
      }

      if (candidate.finishReason === 'STOP') {
        if (verbose) console.log('[Gemini] Model stopped');
        break;
      }

      // Prompt to continue
      response = await chat.sendMessage([{ text: 'Continue. Output the PageIR using output_page_ir tool.' }]);
      continue;
    }

    // Execute function calls
    const functionResponses = [];

    for (const part of functionCalls) {
      const fc = part.functionCall;
      const toolName = fc.name;
      const toolArgs = fc.args || {};

      if (verbose) {
        console.log(`  [${iterations}] ${toolName}(${JSON.stringify(toolArgs).substring(0, 80)}...)`);
      }

      let result;

      switch (toolName) {
        case 'search_block':
          result = executeSearchBlock(textBlocks, toolArgs);
          break;

        case 'get_block':
          result = executeGetBlock(textBlocks, toolArgs);
          break;

        case 'output_page_ir':
          // Validate IR before accepting
          const candidateIR = toolArgs.pageIR;
          candidateIR.pageNumber = pageNumber;
          const validation = validatePageIR(candidateIR, pageNumber);

          if (validation.valid) {
            pageIR = candidateIR;
            result = { success: true, message: 'IR accepted - validation passed' };
            if (verbose) {
              console.log(`  [${iterations}] IR accepted: ${pageIR?.sections?.length || 0} sections`);
            }
          } else {
            // Reject and send errors back for retry
            result = {
              success: false,
              message: 'IR REJECTED - validation failed. Fix these errors and resubmit:',
              errors: validation.errors,
              hint: 'Use search_block to find correct blockIndex values for any text longer than 5 words.'
            };
            if (verbose) {
              console.log(`  [${iterations}] IR REJECTED: ${validation.errors.length} errors`);
              validation.errors.forEach(e => console.log(`    - ${e}`));
            }
          }
          break;

        default:
          result = { error: `Unknown tool: ${toolName}` };
      }

      if (verbose && result.error) {
        console.log(`    ↳ ERROR: ${result.error}`);
      }

      functionResponses.push({
        functionResponse: {
          name: toolName,
          response: result,
        },
      });
    }

    // Send function responses back
    response = await chat.sendMessage(functionResponses);

    // If we got IR, we're done
    if (pageIR) {
      break;
    }
  }

  // Validate the IR
  let validationResult = { valid: false, errors: ['No IR output received'], warnings: [] };

  if (pageIR) {
    pageIR.pageNumber = pageNumber;
    validationResult = validatePageIR(pageIR, pageNumber);
  }

  if (verbose) {
    console.log(`[Gemini] Completed in ${iterations} iterations`);
    console.log(`[Gemini] Valid: ${validationResult.valid}`);
  }

  return {
    pageIR,
    iterations,
    valid: validationResult.valid,
    errors: validationResult.errors,
    warnings: validationResult.warnings,
  };
}

/**
 * Extract IR from multiple pages using Gemini
 */
export async function extractDocumentIRGemini(imagePaths, options = {}) {
  const { layoutDataByPage = [] } = options;
  const pageResults = [];
  const pages = [];

  for (let i = 0; i < imagePaths.length; i++) {
    const pageNumber = i + 1;

    if (options.verbose) {
      console.log(`\n${'='.repeat(50)}`);
      console.log(`Processing Page ${pageNumber} of ${imagePaths.length}`);
      console.log('='.repeat(50));
    }

    // Get layout data for this page (if available)
    const layoutData = layoutDataByPage[i] || null;

    const result = await extractPageIRGemini(imagePaths[i], {
      ...options,
      pageNumber,
      layoutData,
    });

    pageResults.push({
      page: pageNumber,
      ...result,
    });

    if (result.pageIR) {
      pages.push(result.pageIR);
    }
  }

  const documentIR = {
    pages,
    metadata: {
      extractedAt: new Date().toISOString(),
      totalPages: imagePaths.length,
      successfulPages: pages.length,
      model: options.model || 'gemini-2.5-pro',
    },
  };

  return {
    documentIR,
    pageResults,
  };
}

// =============================================================================
// TOOL EXECUTORS
// =============================================================================

/**
 * Search blocks for matching content (PyMuPDF format)
 */
function executeSearchBlock(textBlocks, input) {
  const { hint, search_type = 'fuzzy' } = input;

  if (!hint) return { found: false, error: 'No hint provided' };

  const normalize = (s) =>
    s.replace(/^[^a-zA-Z0-9]+/, '')
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .trim();

  const hintNorm = normalize(hint);
  const hintWords = hintNorm.split(/\s+/).filter((w) => w.length > 2).slice(0, 8);

  if (hintWords.length === 0) {
    return { found: false, error: 'Hint too short after normalization' };
  }

  let bestMatch = null;
  let bestScore = 0;

  for (const block of textBlocks) {
    const blockNorm = normalize(block.text);
    if (blockNorm.length < 3) continue;

    // Prefix match - highest priority
    if (search_type === 'prefix' || search_type === 'fuzzy') {
      if (blockNorm.startsWith(hintNorm.substring(0, 30))) {
        return {
          found: true,
          index: block.id,
          preview: block.text.substring(0, 100) + (block.text.length > 100 ? '...' : ''),
          matchType: 'prefix',
        };
      }
    }

    // Contains match
    if (search_type === 'contains' || search_type === 'fuzzy') {
      if (blockNorm.includes(hintNorm)) {
        return {
          found: true,
          index: block.id,
          preview: block.text.substring(0, 100) + (block.text.length > 100 ? '...' : ''),
          matchType: 'contains',
        };
      }
    }

    // Fuzzy word overlap
    if (search_type === 'fuzzy') {
      const blockWords = blockNorm.split(/\s+/);
      let score = 0;
      for (const hintWord of hintWords) {
        if (blockWords.some((bw) => bw.includes(hintWord) || hintWord.includes(bw))) {
          score++;
        }
      }
      if (score > bestScore) {
        bestScore = score;
        bestMatch = block;
      }
    }
  }

  // Check if best fuzzy match is good enough
  const threshold = hintWords.length * 0.5;
  if (bestMatch && bestScore >= threshold) {
    return {
      found: true,
      index: bestMatch.id,
      preview: bestMatch.text.substring(0, 100) + (bestMatch.text.length > 100 ? '...' : ''),
      matchType: 'fuzzy',
      score: `${bestScore}/${hintWords.length}`,
    };
  }

  return {
    found: false,
    hint: hint,
    message: 'No matching block found',
  };
}

/**
 * Get block by ID (PyMuPDF format)
 */
function executeGetBlock(textBlocks, input) {
  const { index } = input;

  const block = textBlocks.find((b) => b.id === index);
  if (!block) {
    return { error: `Block ID ${index} not found` };
  }

  return {
    index: block.id,
    text: block.text,
    is_bold: block.is_bold,
    font_size: block.font_size,
  };
}
