/**
 * Reconstruction Extractor
 *
 * Simplified extractor for visual reconstruction.
 * Uses Gemini to analyze page images and output simple structure.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { RECONSTRUCTION_SYSTEM_PROMPT, RECONSTRUCTION_TOOLS } from './prompt-reconstruction.js';
import { createGenerativeModel, convertToolsToGemini } from './gemini-client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Extract structure from a single page
 */
export async function extractPageStructure(imagePath, options = {}) {
  const {
    pageNumber = 1,
    maxIterations = 15,
    model = 'gemini-2.5-pro',
    verbose = false,
    textBlocks = [],
    context,
  } = options;

  // Build system instruction with optional user context
  let systemInstruction = RECONSTRUCTION_SYSTEM_PROMPT;
  if (context) {
    systemInstruction += `\n\n## ADDITIONAL CONTEXT FROM USER\n\n${context}`;
  }

  if (verbose) {
    console.log(`[Reconstruction] Using model: ${model}`);
  }

  const generativeModel = createGenerativeModel(model, {
    generationConfig: {
      maxOutputTokens: 8192,
      temperature: 0.1,
    },
    tools: [
      {
        functionDeclarations: convertToolsToGemini(RECONSTRUCTION_TOOLS),
      },
    ],
    systemInstruction,
  });

  // Load image as base64
  const imageBuffer = fs.readFileSync(imagePath);
  const imageBase64 = imageBuffer.toString('base64');
  const mimeType = imagePath.endsWith('.png') ? 'image/png' : 'image/jpeg';

  // Build text blocks preview (for search_block tool)
  const blockPreview = textBlocks
    .slice(0, 50) // Limit preview size
    .map((b) => {
      const preview = b.text.length > 60 ? b.text.substring(0, 60) + '...' : b.text;
      return `[${b.id}] ${preview}`;
    })
    .join('\n');

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

Analyze this document page and output the structure.

## AVAILABLE TEXT BLOCKS (for search_block)

${blockPreview || 'No text blocks available'}

## TASK

1. Look at the page top to bottom
2. Identify headers, tables, paragraphs
3. For long text (>= 20 words), use search_block
4. Output using output_structure tool`,
    },
  ];

  // Start chat session
  const chat = generativeModel.startChat({ history: [] });

  let iterations = 0;
  let pageStructure = null;

  if (verbose) {
    console.log(`\n[Reconstruction] Starting extraction for page ${pageNumber}`);
    console.log(`[Reconstruction] Text blocks available: ${textBlocks.length}`);
  }

  // Send initial message
  let response = await chat.sendMessage(initialContent);

  while (iterations < maxIterations) {
    iterations++;

    const candidate = response.response.candidates?.[0];
    if (!candidate) {
      if (verbose) console.log('[Reconstruction] No candidate in response');
      break;
    }

    const content = candidate.content;
    const parts = content.parts || [];

    // Check for function calls
    const functionCalls = parts.filter((p) => p.functionCall);

    if (functionCalls.length === 0) {
      if (candidate.finishReason === 'STOP') {
        if (verbose) console.log('[Reconstruction] Model stopped');
        break;
      }

      // Prompt to continue
      response = await chat.sendMessage([{ text: 'Output the structure using output_structure tool.' }]);
      continue;
    }

    // Execute function calls
    const functionResponses = [];

    for (const part of functionCalls) {
      const fc = part.functionCall;
      const toolName = fc.name;
      const toolArgs = fc.args || {};

      if (verbose) {
        console.log(`  [${iterations}] ${toolName}(${JSON.stringify(toolArgs).substring(0, 60)}...)`);
      }

      let result;

      switch (toolName) {
        case 'search_block':
          result = executeSearchBlock(textBlocks, toolArgs);
          break;

        case 'output_structure':
          pageStructure = toolArgs.pageStructure;
          pageStructure.pageNumber = pageNumber;

          // Basic validation
          const validation = validateStructure(pageStructure);
          if (validation.valid) {
            result = { success: true, message: 'Structure accepted' };
            if (verbose) {
              console.log(`  [${iterations}] Structure accepted: ${pageStructure.elements?.length || 0} elements`);
            }
          } else {
            result = {
              success: false,
              message: 'Structure rejected',
              errors: validation.errors,
            };
            pageStructure = null; // Reset so we retry
            if (verbose) {
              console.log(`  [${iterations}] Structure rejected: ${validation.errors.join(', ')}`);
            }
          }
          break;

        default:
          result = { error: `Unknown tool: ${toolName}` };
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

    // If we got structure, we're done
    if (pageStructure) {
      break;
    }
  }

  if (verbose) {
    console.log(`[Reconstruction] Completed in ${iterations} iterations`);
  }

  return {
    pageStructure,
    iterations,
    success: pageStructure !== null,
  };
}

/**
 * Extract structure from multiple pages
 * @param {string[]} imagePaths - Array of image paths to process
 * @param {Object} options - Extraction options
 * @param {string} [options.context] - Additional context from user to append to system prompt
 * @param {function} [options.onPageComplete] - Callback (pageNum, totalPages) called after each page
 * @param {Array} [options.textBlocksByPage] - Text blocks for each page
 * @param {boolean} [options.verbose] - Enable verbose logging
 */
export async function extractDocumentStructure(imagePaths, options = {}) {
  const { textBlocksByPage = [], verbose = false, context, onPageComplete } = options;
  const pageResults = [];
  const pages = [];

  for (let i = 0; i < imagePaths.length; i++) {
    const pageNumber = i + 1;

    if (verbose) {
      console.log(`\n${'='.repeat(50)}`);
      console.log(`Processing Page ${pageNumber} of ${imagePaths.length}`);
      console.log('='.repeat(50));
    }

    const textBlocks = textBlocksByPage[i] || [];

    const result = await extractPageStructure(imagePaths[i], {
      ...options,
      pageNumber,
      textBlocks,
      context,
    });

    pageResults.push({
      page: pageNumber,
      ...result,
    });

    if (result.pageStructure) {
      pages.push(result.pageStructure);
    }

    // Call progress callback
    if (onPageComplete) {
      onPageComplete(pageNumber, imagePaths.length);
    }
  }

  return {
    documentStructure: {
      pages,
      metadata: {
        extractedAt: new Date().toISOString(),
        totalPages: imagePaths.length,
        successfulPages: pages.length,
      },
    },
    pageResults,
  };
}

/**
 * Search blocks for matching content
 */
function executeSearchBlock(textBlocks, input) {
  const { hint } = input;

  if (!hint) return { found: false, error: 'No hint provided' };

  const normalize = (s) =>
    s
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .trim();

  const hintNorm = normalize(hint);

  for (const block of textBlocks) {
    const blockNorm = normalize(block.text);

    // Prefix match
    if (blockNorm.startsWith(hintNorm.substring(0, 30))) {
      return {
        found: true,
        blockIndex: block.id,
        preview: block.text.substring(0, 80) + (block.text.length > 80 ? '...' : ''),
      };
    }

    // Contains match
    if (blockNorm.includes(hintNorm.substring(0, 30))) {
      return {
        found: true,
        blockIndex: block.id,
        preview: block.text.substring(0, 80) + (block.text.length > 80 ? '...' : ''),
      };
    }
  }

  return {
    found: false,
    hint: hint,
    message: 'No matching block found',
  };
}

/**
 * Validate page structure
 */
function validateStructure(structure) {
  const errors = [];

  if (!structure.elements || !Array.isArray(structure.elements)) {
    errors.push('Missing or invalid elements array');
    return { valid: false, errors };
  }

  if (structure.elements.length === 0) {
    errors.push('Elements array is empty');
    return { valid: false, errors };
  }

  for (let i = 0; i < structure.elements.length; i++) {
    const el = structure.elements[i];

    if (!el.type) {
      errors.push(`Element ${i}: missing type`);
      continue;
    }

    if (!['header', 'table', 'paragraph'].includes(el.type)) {
      errors.push(`Element ${i}: invalid type "${el.type}" (must be header, table, or paragraph)`);
    }

    if (el.type === 'table' && (!el.rows || !Array.isArray(el.rows))) {
      errors.push(`Element ${i}: table missing rows array`);
    }

    if (el.type === 'paragraph' && !el.text && el.blockIndex === undefined) {
      errors.push(`Element ${i}: paragraph needs either text or blockIndex`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
