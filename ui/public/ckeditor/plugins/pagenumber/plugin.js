CKEDITOR.plugins.add('pagenumber', {
  icons: 'pagenumber',
  hidpi: true,
  init: init
});

function init(editor) {

  editor.addCommand('addPageNumber', {
    exec: function (editor) {
      var pageNumber = editor.document.createElement("current-page");
      if (editor.document.getById('leegality-current-page') != null) {
        pageNumber = editor.document.getById('leegality-current-page');
      } else {
        pageNumber.setAttribute('id', 'leegality-current-page');
        pageNumber.setText('[[page number]]');
        editor.insertElement(pageNumber);
        var para = editor.document.createElement("span");
        para.setText(" ");
        editor.insertElement(para);
      }
    }

  });
  editor.ui.addButton('PageNumber', {
    label: 'Add Page Number',
    command: 'addPageNumber',
    toolbar: 'indent,100'
  });


}

