CKEDITOR.plugins.add('excludefooter', {
  icons: 'excludefooter',
  hidpi: true,
  init: init
});

function init(editor) {
  CKEDITOR.dialog.add('excludeFooterDialog', this.path + 'dialogs/excludefooter.js');
  editor.addCommand('excludeFooter', new CKEDITOR.dialogCommand('excludeFooterDialog'));
  editor.ui.addButton('ExcludeFooter', {
    label: 'Exclude Footer',
    command: 'excludeFooter',
    toolbar: 'indent,100'
  });


}

