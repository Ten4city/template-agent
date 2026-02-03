CKEDITOR.plugins.add('totalpage', {
  icons: 'totalpage',
  hidpi: true,
  init: init
});

function init(editor) {

  editor.addCommand('addTotalPage', {
    exec: function (editor) {
      var pageNumber = editor.document.createElement("total-page");
      if (editor.document.getById('leegality-total-page') != null) {
        pageNumber = editor.document.getById('leegality-total-page');
      } else {
        var para = editor.document.createElement("span");
        para.setText(" ");
        editor.insertElement(para);
        pageNumber.setAttribute('id', 'leegality-total-page');
        pageNumber.setText('[[total pages]]');
        editor.insertElement(pageNumber)
      }
    }

  });
  editor.ui.addButton('TotalPage', {
    label: 'Add Total Page',
    command: 'addTotalPage',
    toolbar: 'indent,100'
  });


}

