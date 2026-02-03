CKEDITOR.dialog.add('excludeFooterDialog', function (editor) {
  return {
    title: 'Exclude Footer (Ignore Footer from pages)',
    minWidth: 400,
    minHeight: 200,
    contents: [
      {
        id: 'exclude-footer',
        label: 'Ignore Pages for Footer',
        elements: [
          {
            type: 'text',
            id: 'excludeFooter',
            label: 'Page Number (Add comma seperated page numbers)',
            default: ''
            // validate: CKEDITOR.dialog.validate.notEmpty("Abbreviation field cannot be empty.")
          },
        ]
      }
    ],
    onShow: function () {
      var pages = null;
      var parser = new DOMParser();
      var element = parser.parseFromString(editor.getData(), 'text/html');
      var pageNumberElement = element.getElementById('leegality-exclude-footer');
      if (pageNumberElement) {
        pages = pageNumberElement.getAttribute('page-numbers');
      }
      if (pages) {
        this.setValueOf('exclude-footer', 'excludeFooter', pages);
      }

    },
    onOk: function () {
      var dialog = this;
      var div = editor.document.createElement('exclude-footer');
      if (editor.document.getById('leegality-exclude-footer') != null) {
        div = editor.document.getById('leegality-exclude-footer');
      } else {
        div.setAttribute('id', 'leegality-exclude-footer');
        editor.insertElement(div)
      }
      if (dialog.getValueOf('exclude-footer', 'excludeFooter')) {
        div.setAttribute('page-numbers', dialog.getValueOf('exclude-footer', 'excludeFooter'))
      }
    }
  };
});
