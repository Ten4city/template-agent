/**
 * Vision HTML Agent v2 - Main Agent Loop
 *
 * Supports both Claude and Gemini (Vertex AI)
 * Set MODEL=gemini in .env to use Gemini
 */

import Anthropic from "@anthropic-ai/sdk";
import { toolDefinitions } from "./tools.js";
import { ToolExecutor } from "./executor.js";
import { loadImageAsBase64 } from "./render.js";
import { runGeminiAgent } from "./gemini.js";
import { SYSTEM_PROMPT } from "./prompt.js";

/**
 * Run the agent on a single page
 */
export async function runAgent(imagePath, textBlocks, options = {}) {
  const {
    provider = process.env.MODEL_PROVIDER || "claude",
    model,
    maxIterations = 100,
    previousContext = null,
    verbose = true
  } = options;

  const executor = new ToolExecutor(textBlocks, { previousContext });

  // Use Gemini if specified
  if (provider === "gemini") {
    const geminiModel = model || "gemini-2.5-pro";
    return runGeminiAgent(imagePath, textBlocks, toolDefinitions, executor, {
      maxIterations,
      verbose,
      model: geminiModel
    });
  }

  // Default: Claude
  const client = new Anthropic();
  const claudeModel = model || "claude-sonnet-4-20250514";

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
Recreate this document page as HTML WITH FORM FIELDS.

IMPORTANT:
- Every blank/underline needs an input field (insert_textfield)
- Every checkbox symbol needs insert_checkbox
- Every radio option group needs insert_radio
- Use the FIELD DETECTION PATTERNS from your instructions

Start by using think() to analyze the page structure, then build it section by section.
Call finish_page() when complete.`
    }
  ];

  const messages = [{ role: "user", content: userContent }];

  // Agent loop
  let iterations = 0;

  if (verbose) {
    console.log(`[Claude] Starting with ${textBlocks.length} text blocks`);
  }

  while (!executor.isFinished() && iterations < maxIterations) {
    iterations++;

    try {
      const response = await client.messages.create({
        model: claudeModel,
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
            console.log(`[Claude] Model ended without finish_page. Auto-finishing...`);
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
            console.log(`[Claude:${iterations}] think: ${toolUse.input.reasoning?.substring(0, 100)}...`);
          } else {
            console.log(`[Claude:${iterations}] ${toolUse.name}(${JSON.stringify(toolUse.input).substring(0, 60)}...)`);
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
      console.error(`[Claude] Error:`, error.message);
      break;
    }
  }

  if (verbose) {
    console.log(`[Claude] Completed in ${iterations} iterations`);
    console.log(`[Claude] HTML output: ${executor.getOutput().length} chars`);
  }

  return {
    html: executor.getFullOutput(),
    iterations,
    finished: executor.isFinished()
  };
}

/**
 * Run agent on multiple pages
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
