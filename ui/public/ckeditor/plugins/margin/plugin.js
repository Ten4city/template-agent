CKEDITOR.plugins.add('margin', {
  icons: 'margin',
  hidpi: true,
  init: init
});

function init(editor) {
  CKEDITOR.dialog.add( 'marginDialog', this.path + 'dialogs/margin.js' );
  editor.addCommand('addMargin', new CKEDITOR.dialogCommand('marginDialog'));
  editor.ui.addButton('Margin', {
    label: 'Add Margin',
    command: 'addMargin',
    toolbar: 'indent,100'
  });



}

