CKEDITOR.plugins.add('excludeheader', {
  icons: 'excludeheader',
  hidpi: true,
  init: init
});

function init(editor) {
  CKEDITOR.dialog.add('excludeHeaderDialog', this.path + 'dialogs/excludeheader.js');
  editor.addCommand('excludeHeader', new CKEDITOR.dialogCommand('excludeHeaderDialog'));
  editor.ui.addButton('ExcludeHeader', {
    label: 'Exclude Header',
    command: 'excludeHeader',
    toolbar: 'indent,100'
  });


}

