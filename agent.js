/**
 * Vision HTML Agent v2 - Main Agent Loop
 *
 * Sends document images + text blocks to Claude
 * Handles tool calls iteratively until completion
 */

import Anthropic from "@anthropic-ai/sdk";
import { toolDefinitions } from "./tools.js";
import { ToolExecutor } from "./executor.js";
import { loadImageAsBase64 } from "./render.js";

// System prompt for the vision agent
const SYSTEM_PROMPT = `You are a document reconstruction agent. You look at document images and recreate them as HTML using the available tools.

## YOUR MISSION
Given a document page image and extracted text blocks, recreate the document structure and content in HTML that matches the visual layout.

## CRITICAL PRINCIPLES

### 1. VISUAL STRUCTURE FROM IMAGE
Look at the image to understand:
- Page layout (tables, columns, sections)
- Visual hierarchy (headers, spacing)
- Form fields (text boxes, checkboxes, image uploads)
- Table structure (rowspan, colspan, borders)

### 2. CONTENT FROM TEXT BLOCKS (Anti-Hallucination)
**NEVER write document content directly.** Always:
1. Use \`search_block(hint)\` to find the text block index
2. Use the block_index in your tools to insert content

You may only write direct text for:
- Labels like "Name:", "Date:", "Address:"
- Form field placeholders
- Static text that doesn't come from the document

### 3. TABLES ARE LAYOUT
Most document layouts use tables:
- Borderless tables for form layouts (label + field)
- Bordered tables for data grids
- Tables with rowspan/colspan for complex layouts (like photo boxes spanning multiple rows)

### 4. ITERATIVE APPROACH
You can create, inspect, and modify:
1. Create initial structure
2. Use get_table_state() to verify
3. Modify with set_cell_*, set_rowspan, etc.
4. Check with get_output_preview()

## TOOL CATEGORIES

### Text Retrieval (use these to find content)
- search_block(hint) → returns block index
- get_block(index) → get full content
- list_blocks() → see available blocks

### Tables (for layout)
- create_table(rows, cols, ...) → returns table_id
- set_rowspan/set_colspan → for complex layouts
- set_cell_content(table_id, row, col, block_index) → place content
- set_cell_properties → styling

### Form Fields
- insert_textfield, insert_textarea → text input
- insert_checkbox, insert_radio → selection
- insert_image_upload → for photo uploads

### Paragraphs & Lists
- insert_paragraph(block_index) → simple text
- insert_list_item(block_index, marker) → numbered/bulleted items

### Control
- think(reasoning) → plan before complex operations
- get_table_state(table_id) → verify your work
- get_output_preview() → see current HTML
- finish_page() → signal completion

## WORKFLOW

1. **Analyze the image** - Identify major sections, tables, forms
2. **think()** - Plan your approach for the section
3. **Build structure** - Create tables with proper dimensions
4. **Set cell properties** - Widths, backgrounds, spans
5. **search_block() + set_cell_content()** - Place content
6. **Verify** - Use inspection tools to check
7. **Repeat** for each section
8. **finish_page()** when done

## EXAMPLE: CO-APPLICANT FORM WITH PHOTO BOX

For a form like "CO-APPLICANT DETAILS" with a photo box spanning 7 rows:

\`\`\`
think("CO-APPLICANT section has 2 columns: left for form fields, right for photo spanning 7 rows")
create_table(rows=7, cols=2, width="100%", border=0)
set_cell_background(table_id, 0, 0, "#3366cc")  // Header row
set_colspan(table_id, 0, 0, 2)  // Header spans both columns

// Photo box spans rows 1-6 on the right
set_rowspan(table_id, 1, 1, 7)
set_cell_content(table_id, 1, 1, html="<image upload field>")

// Left column has form fields on each row
search_block("Name:") → get index
set_cell_content(table_id, 1, 0, text="Name:", append field)
// ... continue for other fields
\`\`\`

Remember: The goal is HTML that LOOKS like the document image when rendered.`;

/**
 * Run the agent on a single page
 *
 * @param {string} imagePath - Path to page image
 * @param {Array} textBlocks - Extracted text blocks
 * @param {Object} options - Configuration options
 * @returns {Promise<{html: string, iterations: number, finished: boolean}>}
 */
export async function runAgent(imagePath, textBlocks, options = {}) {
  const {
    model = "claude-sonnet-4-20250514",
    maxIterations = 100,
    previousContext = null,
    verbose = true
  } = options;

  const client = new Anthropic();
  const executor = new ToolExecutor(textBlocks, { previousContext });

  // Build initial message with image
  const imageData = loadImageAsBase64(imagePath);

  const userContent = [
    {
      type: "image",
      source: imageData
    },
    {
      type: "text",
      text: `## TEXT BLOCKS AVAILABLE
The following text blocks were extracted from the document. Use search_block(hint) to find the right block, then use block_index in tools.

${textBlocks.map((b, i) => `[${i}] (${b.type}) ${b.text.substring(0, 80)}${b.text.length > 80 ? "..." : ""}`).join("\n")}

## TASK
Recreate this document page as HTML. Focus on matching the visual layout from the image while using text blocks for content.

Start by using think() to analyze the page structure, then build it section by section.
Call finish_page() when complete.`
    }
  ];

  const messages = [{ role: "user", content: userContent }];

  // Agent loop
  let iterations = 0;

  if (verbose) {
    console.log(`[Agent] Starting with ${textBlocks.length} text blocks`);
  }

  while (!executor.isFinished() && iterations < maxIterations) {
    iterations++;

    try {
      const response = await client.messages.create({
        model,
        max_tokens: 8192,
        system: SYSTEM_PROMPT,
        tools: toolDefinitions,
        messages
      });

      const assistantContent = response.content;
      messages.push({ role: "assistant", content: assistantContent });

      // Check for tool use
      const toolUses = assistantContent.filter(block => block.type === "tool_use");

      if (toolUses.length === 0) {
        if (response.stop_reason === "end_turn") {
          if (verbose) {
            console.log(`[Agent] Model ended without finish_page. Auto-finishing...`);
          }
          break;
        }
        continue;
      }

      // Execute tools
      const toolResults = [];
      for (const toolUse of toolUses) {
        if (verbose) {
          if (toolUse.name === "think") {
            console.log(`[Agent:${iterations}] think: ${toolUse.input.reasoning?.substring(0, 100)}...`);
          } else {
            console.log(`[Agent:${iterations}] ${toolUse.name}(${JSON.stringify(toolUse.input).substring(0, 60)}...)`);
          }
        }

        const result = executor.execute(toolUse.name, toolUse.input);

        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: JSON.stringify(result)
        });

        if (verbose && result.error) {
          console.log(`  ↳ ERROR: ${result.error}`);
        }
      }

      messages.push({ role: "user", content: toolResults });

    } catch (error) {
      console.error(`[Agent] Error:`, error.message);
      break;
    }
  }

  if (verbose) {
    console.log(`[Agent] Completed in ${iterations} iterations`);
    console.log(`[Agent] HTML output: ${executor.getOutput().length} chars`);
  }

  return {
    html: executor.getFullOutput(),
    iterations,
    finished: executor.isFinished()
  };
}

/**
 * Run agent on multiple pages
 *
 * @param {string[]} imagePaths - Array of page image paths
 * @param {Array} textBlocks - All text blocks (agent will use indices)
 * @param {Object} options - Configuration options
 * @returns {Promise<{html: string, pageResults: Array}>}
 */
export async function runAgentMultiPage(imagePaths, textBlocks, options = {}) {
  const pageResults = [];
  let fullHtml = "";
  let previousContext = null;

  for (let i = 0; i < imagePaths.length; i++) {
    console.log(`\n=== Processing Page ${i + 1}/${imagePaths.length} ===\n`);

    const result = await runAgent(imagePaths[i], textBlocks, {
      ...options,
      previousContext
    });

    pageResults.push({
      page: i + 1,
      ...result
    });

    fullHtml += result.html;

    // Update context for next page (if page reported continuing structure)
    previousContext = result.continuingContext || null;
  }

  return {
    html: fullHtml,
    pageResults
  };
}

// CLI for testing
if (process.argv[1].endsWith("agent.js")) {
  const imagePath = process.argv[2];

  if (!imagePath) {
    console.log("Usage: node agent.js <image-path>");
    console.log("  Runs agent on a single page image");
    process.exit(1);
  }

  // For CLI testing, use empty blocks (user should provide real blocks)
  runAgent(imagePath, [], { verbose: true })
    .then(result => {
      console.log("\n=== RESULT ===");
      console.log(`Iterations: ${result.iterations}`);
      console.log(`Finished: ${result.finished}`);
      console.log(`HTML (${result.html.length} chars):`);
      console.log(result.html.substring(0, 1000));
    })
    .catch(err => {
      console.error("Agent failed:", err.message);
      process.exit(1);
    });
}
