CKEDITOR.dialog.add('borderDialog', function (editor) {
  return {
    title: 'Border Properties',
    minWidth: 400,
    minHeight: 200,
    contents: [
      {
        id: 'set-border',
        label: 'Border Settings',
        elements: [
          {
            type: 'text',
            id: 'borderSize',
            label: 'Thickness (px)',
            default: 1
          },
          {
            type: 'text',
            id: 'borderMargin',
            label: 'Distance from page edge (px)',
            default: 30
          },
          {
            type: 'select',
            id: 'borderType',
            label: 'Style',
            items: [
              ["Solid", "SOLID"],
              ["Dotted", "DOTTED"]
            ],
            default: "SOLID"
          },
        ]
      }
    ],

    onShow: function () {
      var size = null;
      var margin = null;
      var type = null;
      var parser = new DOMParser();
      var element = parser.parseFromString(editor.getData(), 'text/html');
      var borderElement = element.getElementById('leegality-border');
      if (borderElement) {
        size = borderElement.getAttribute('border-size');
        margin = borderElement.getAttribute('border-margin');
        type = borderElement.getAttribute('border-type')
      }
      if (size) {
        this.setValueOf('set-border', 'borderSize', size);
      }
      if (margin) {
        this.setValueOf('set-border', 'borderMargin', margin);
      }
      if (type) {
        this.setValueOf('set-border', 'borderType', type);
      }

    },

    onOk: function () {
      var dialog = this;
      var div = editor.document.createElement('border');
      if (editor.document.getById('leegality-border') != null) {
        div = editor.document.getById('leegality-border');
      } else {
        div.setAttribute('id', 'leegality-border');
        editor.insertElement(div)
      }
      if (dialog.getValueOf('set-border', 'borderSize')) {
        div.setAttribute('border-size', dialog.getValueOf('set-border', 'borderSize'))
      }
      if (dialog.getValueOf('set-border', 'borderMargin')) {
        div.setAttribute('border-margin', dialog.getValueOf('set-border', 'borderMargin'))
      }
      if (dialog.getValueOf('set-border', 'borderType')) {
        div.setAttribute('border-type', dialog.getValueOf('set-border', 'borderType'))

      }
    }
  };
});
