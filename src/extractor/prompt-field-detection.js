/**
 * Field Detection Prompt
 *
 * System prompt for LLM to identify fillable form fields
 * in documents and return their locations.
 */

export const FIELD_DETECTION_SYSTEM_PROMPT = `You are a form field identification assistant. Analyze the document image and current structure to identify fillable form fields.

## FIELD RECOGNITION PATTERNS

**Text fields (type: textbox):**
- Consecutive underscores: _____, ________
- Empty table cells after labels
- Bracketed placeholders: [Name], <Value>, «FIELD», {{placeholder}}
- Example values: "DD/MM/YYYY", "$1000", "John Doe"

**Email fields (type: email):**
- Labels containing: "email", "e-mail", "Email Address"
- Table headers: "Email", "Email ID"

**Phone fields (type: tel):**
- Labels containing: "phone", "mobile", "contact", "telephone"

**Date fields (type: date):**
- Labels containing: "date", "DOB", "birthday", "expiry", "valid until"
- Format hints: DD/MM/YYYY, MM-DD-YYYY

**Number fields (type: number):**
- Labels containing: "amount", "quantity", "age", "PIN", "number"
- Financial contexts (Rs., $, amounts)

**Checkbox fields (type: checkbox):**
- Symbols: □, ☐, ⬜, ✓, ☑
- Multiple options with "check all that apply"
- Non-mutually-exclusive options

**Radio fields (type: radio):**
- Symbols: ○, ◯
- Mutually exclusive options: "Yes/No", "Male/Female/Other"
- Vertical lists with (a), (b), (c) markers where only one can be selected

**Textarea fields (type: textarea):**
- Large blank areas
- Labels: "remarks", "comments", "description", "address" (multi-line)
- Multiple lines of underscores

**Image upload (type: image):**
- Phrases: "upload photo", "attach image", "photo ID", "passport photo"
- Photo boxes in forms

## EXCLUSIONS - DO NOT MARK AS FIELDS
- Signature lines ("Signature:", "Sign here", "Authorized Signatory")
- Pre-filled static content
- Headers and titles
- Labels themselves (only the VALUE areas are fields)
- Decorative elements

## OUTPUT FORMAT

Return a JSON object with a fields array:

{
  "fields": [
    {
      "elementIndex": 2,
      "location": {"row": 1, "col": 2},
      "type": "textbox",
      "name": "applicant_name"
    },
    {
      "elementIndex": 5,
      "splitParagraph": {
        "before": "I, ",
        "after": ", hereby declare..."
      },
      "type": "textbox",
      "name": "declarant_name"
    },
    {
      "elementIndex": 3,
      "location": {"row": 2, "col": 1},
      "type": "radio",
      "name": "gender",
      "options": [
        {"value": "male", "label": "Male"},
        {"value": "female", "label": "Female"}
      ]
    }
  ]
}

## LOCATION RULES

**For table cells:** Use elementIndex + location (row, col)
- elementIndex: The index of the table element in the page structure
- location.row: Zero-based row index within the table
- location.col: Zero-based column index within the row

**For paragraphs with inline fields:** Use elementIndex + splitParagraph
- splitParagraph.before: Text before the field
- splitParagraph.after: Text after the field

**For checkbox/radio groups:** Include options array
- Each option has value (snake_case) and label (display text)
- Use the same name for all options in a group

## FIELD NAMING

Generate semantic field names in snake_case:
- "date_of_birth" not "dob" or "field1"
- "applicant_email" not "email1"
- "gender" not "radio_group_1"

For groups (checkbox/radio), the name should describe the group, not individual options.

## WORKFLOW

1. Look at the page image to understand visual layout
2. Review the current structure JSON
3. For each element, identify if it contains fillable fields
4. For tables: check each cell for field indicators
5. For paragraphs: check for inline placeholders
6. Return ALL identified fields with their locations

Be thorough but precise. Only mark actual fillable areas, not labels or static text.`;

/**
 * Build the user message for field detection
 * @param {Object} pageStructure - The structure JSON for the page
 * @returns {string} The user prompt
 */
export function buildFieldDetectionPrompt(pageStructure) {
  return `## CURRENT STRUCTURE

${JSON.stringify(pageStructure, null, 2)}

## TASK

Analyze the document image and the structure above. Identify all fillable form fields and return their locations in the specified JSON format.

Remember:
- Look for underscores, empty cells, placeholders, checkbox/radio symbols
- Exclude signature lines
- Use appropriate field types based on context (email, tel, date, etc.)
- Generate semantic snake_case names
- For radio/checkbox, include the options array`;
}

/**
 * Tool definition for field detection output
 */
export const FIELD_DETECTION_TOOLS = [
  {
    name: 'output_fields',
    description: 'Output the detected fields. Call this after analyzing the page.',
    input_schema: {
      type: 'object',
      properties: {
        fields: {
          type: 'array',
          description: 'Array of detected field objects',
          items: {
            type: 'object',
            properties: {
              elementIndex: {
                type: 'number',
                description: 'Index of the element containing this field',
              },
              location: {
                type: 'object',
                description: 'For table cells: row and col indices',
                properties: {
                  row: { type: 'number' },
                  col: { type: 'number' },
                },
              },
              splitParagraph: {
                type: 'object',
                description: 'For inline paragraph fields: text before and after',
                properties: {
                  before: { type: 'string' },
                  after: { type: 'string' },
                },
              },
              type: {
                type: 'string',
                enum: ['textbox', 'email', 'tel', 'date', 'number', 'checkbox', 'radio', 'textarea', 'image'],
                description: 'The field type',
              },
              name: {
                type: 'string',
                description: 'Semantic field name in snake_case',
              },
              options: {
                type: 'array',
                description: 'For checkbox/radio: the available options',
                items: {
                  type: 'object',
                  properties: {
                    value: { type: 'string' },
                    label: { type: 'string' },
                  },
                },
              },
            },
            required: ['elementIndex', 'type', 'name'],
          },
        },
      },
      required: ['fields'],
    },
  },
];
