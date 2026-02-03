CKEDITOR.plugins.add('border', {
  icons: 'border',
  hidpi: true,
  init: init
});

function init(editor) {
  CKEDITOR.dialog.add( 'borderDialog', this.path + 'dialogs/border.js' );
  editor.addCommand('addBorder', new CKEDITOR.dialogCommand('borderDialog'));
  editor.ui.addButton('Border', {
    label: 'Add Border',
    command: 'addBorder',
    toolbar: 'indent,100'
  });



}
