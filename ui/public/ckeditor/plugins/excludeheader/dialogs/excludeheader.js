CKEDITOR.dialog.add('excludeHeaderDialog', function (editor) {
  return {
    title: 'Exclude Header (Ignore Header from pages)',
    minWidth: 400,
    minHeight: 200,
    contents: [
      {
        id: 'exclude-header',
        label: 'Ignore Pages for Header',
        elements: [
          {
            type: 'text',
            id: 'excludeHeader',
            label: 'Page Number (Add comma seperated page numbers)',
            // validate: CKEDITOR.dialog.validate.notEmpty("Abbreviation field cannot be empty.")
          },
        ]
      }
    ],

    onShow: function () {
      var pages = null;
      var parser = new DOMParser();
      var element = parser.parseFromString(editor.getData(), 'text/html');
      var pageNumberElement = element.getElementById('leegality-exclude-header');
      if (pageNumberElement) {
        pages = pageNumberElement.getAttribute('page-numbers');
      }
      if (pages) {
        this.setValueOf('exclude-header', 'excludeHeader', pages);
      }

    },
    onOk: function () {
      var dialog = this;
      var div = editor.document.createElement('exclude-header');
      if (editor.document.getById('leegality-exclude-header') != null) {
        div = editor.document.getById('leegality-exclude-header');
      } else {
        div.setAttribute('id', 'leegality-exclude-header');
        editor.insertElement(div)
      }
      if (dialog.getValueOf('exclude-header', 'excludeHeader')) {
        div.setAttribute('page-numbers', dialog.getValueOf('exclude-header', 'excludeHeader'))
      }

    }
  };
});
