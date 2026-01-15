/**
 * LLM Extractor
 *
 * Takes page image + text blocks → outputs Semantic IR
 * Uses Claude or Gemini based on environment config.
 */

import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import { EXTRACTION_SYSTEM_PROMPT, EXTRACTION_TOOLS } from './prompt.js';
import { searchBlocks } from '../../extraction.js';
import { validatePageIR } from '../schema/validator.js';

// Initialize Anthropic client
const anthropic = new Anthropic();

/**
 * Extract IR from a single page
 * @param {string} imagePath - Path to page image (PNG)
 * @param {Array} textBlocks - Extracted text blocks from document
 * @param {Object} options - Configuration options
 * @returns {Promise<Object>} - { pageIR, iterations, valid, errors }
 */
export async function extractPageIR(imagePath, textBlocks, options = {}) {
  const {
    pageNumber = 1,
    maxIterations = 30,
    model = 'claude-sonnet-4-20250514',
    verbose = false,
  } = options;

  // Load image as base64
  const imageData = loadImageAsBase64(imagePath);

  // Build initial user message
  const blockPreview = formatBlockPreview(textBlocks);
  const userContent = [
    {
      type: 'image',
      source: {
        type: 'base64',
        media_type: 'image/png',
        data: imageData,
      },
    },
    {
      type: 'text',
      text: `## PAGE ${pageNumber}

Analyze this document page and output a Semantic IR representation.

## AVAILABLE TEXT BLOCKS

The following text blocks were extracted from the document. Use search_block to find the right index, then include blockIndex in your IR.

${blockPreview}

## TASK

1. Observe the page structure carefully
2. Identify each section and its type
3. Search for text blocks to get blockIndex values
4. Output the complete PageIR using output_page_ir tool

Start by analyzing the visible structure, then build the IR.`,
    },
  ];

  // Initialize conversation
  const messages = [{ role: 'user', content: userContent }];
  let iterations = 0;
  let pageIR = null;

  // Run extraction loop
  while (iterations < maxIterations) {
    iterations++;

    if (verbose) {
      console.log(`\n[Iteration ${iterations}]`);
    }

    // Call Claude
    const response = await anthropic.messages.create({
      model,
      max_tokens: 8192,
      system: EXTRACTION_SYSTEM_PROMPT,
      tools: EXTRACTION_TOOLS,
      messages,
    });

    // Process response
    const assistantContent = response.content;
    messages.push({ role: 'assistant', content: assistantContent });

    // Check for tool use
    const toolUses = assistantContent.filter((block) => block.type === 'tool_use');

    if (toolUses.length === 0) {
      // No tool calls - check if we got text response
      const textBlock = assistantContent.find((block) => block.type === 'text');
      if (textBlock && verbose) {
        console.log(`  Text: ${textBlock.text.substring(0, 100)}...`);
      }

      // Check stop reason
      if (response.stop_reason === 'end_turn') {
        if (verbose) console.log('  End turn without IR output');
        break;
      }
      continue;
    }

    // Process tool calls
    const toolResults = [];

    for (const toolUse of toolUses) {
      const { name, input, id } = toolUse;

      if (verbose) {
        console.log(`  Tool: ${name}`);
      }

      let result;

      switch (name) {
        case 'search_block':
          result = executeSearchBlock(textBlocks, input);
          break;

        case 'get_block':
          result = executeGetBlock(textBlocks, input);
          break;

        case 'output_page_ir':
          pageIR = input.pageIR;
          result = { success: true, message: 'IR received' };

          if (verbose) {
            console.log(`  IR received: ${pageIR.sections?.length || 0} sections`);
          }
          break;

        default:
          result = { error: `Unknown tool: ${name}` };
      }

      toolResults.push({
        type: 'tool_result',
        tool_use_id: id,
        content: JSON.stringify(result),
      });
    }

    // Add tool results to conversation
    messages.push({ role: 'user', content: toolResults });

    // If we got IR, we're done
    if (pageIR) {
      break;
    }
  }

  // Validate the IR
  let validationResult = { valid: false, errors: ['No IR output received'], warnings: [] };

  if (pageIR) {
    // Ensure pageNumber is set
    pageIR.pageNumber = pageNumber;
    validationResult = validatePageIR(pageIR, pageNumber);
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
 * Extract IR from multiple pages
 * @param {string[]} imagePaths - Array of page image paths
 * @param {Array} textBlocks - Extracted text blocks from document
 * @param {Object} options - Configuration options
 * @returns {Promise<Object>} - { documentIR, pageResults }
 */
export async function extractDocumentIR(imagePaths, textBlocks, options = {}) {
  const pageResults = [];
  const pages = [];

  for (let i = 0; i < imagePaths.length; i++) {
    const pageNumber = i + 1;

    if (options.verbose) {
      console.log(`\n${'='.repeat(50)}`);
      console.log(`Processing Page ${pageNumber} of ${imagePaths.length}`);
      console.log('='.repeat(50));
    }

    const result = await extractPageIR(imagePaths[i], textBlocks, {
      ...options,
      pageNumber,
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

function executeSearchBlock(textBlocks, input) {
  const { hint, search_type = 'fuzzy' } = input;
  return searchBlocks(textBlocks, hint, search_type);
}

function executeGetBlock(textBlocks, input) {
  const { index } = input;

  if (index < 0 || index >= textBlocks.length) {
    return { error: `Block index ${index} out of range (0-${textBlocks.length - 1})` };
  }

  const block = textBlocks[index];
  return {
    index,
    type: block.type,
    text: block.text,
    html: block.html,
    tag: block.tag,
  };
}

// =============================================================================
// HELPERS
// =============================================================================

function loadImageAsBase64(imagePath) {
  const buffer = fs.readFileSync(imagePath);
  return buffer.toString('base64');
}

function formatBlockPreview(blocks, maxPreview = 80) {
  return blocks
    .map((b) => {
      const preview =
        b.text.length > maxPreview ? b.text.substring(0, maxPreview) + '...' : b.text;
      return `[${b.index}] (${b.type}) ${preview}`;
    })
    .join('\n');
}
