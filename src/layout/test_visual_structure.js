import { extractLayout, buildRowContext } from './index.js';

const docPath = '/Users/ritik/Downloads/Doc for testing/Gold Loan Application cum Ledger_271025.docx';

console.log('Extracting layout for page 1...');
const result = await extractLayout(docPath, 1);

console.log('\n=== VISUAL SECTIONS ===');
console.log(JSON.stringify(result.visual_sections, null, 2));

console.log('\n=== BUILD ROW CONTEXT ===');
const context = buildRowContext(result);
console.log('Has visual_structure:', !!context.visual_structure);
if (context.visual_structure) {
  console.log('Table count:', context.visual_structure.table_count);
  console.log('Tables:', JSON.stringify(context.visual_structure.tables, null, 2));
}
