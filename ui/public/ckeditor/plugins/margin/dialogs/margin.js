CKEDITOR.dialog.add('marginDialog', function (editor) {
  var marginTop = 62;
  var marginBottom = 62;
  var marginLeft = 48;
  var marginRight = 48;
  return {
    title: 'Margin Properties',
    minWidth: 400,
    minHeight: 200,
    contents: [
      {
        id: 'set-margin',
        label: 'Margin Settings',
        elements: [
          {
            type: 'text',
            id: 'marginTop',
            label: 'Top (px)',
            default: marginTop
            // validate: CKEDITOR.dialog.validate.notEmpty("Abbreviation field cannot be empty.")
          },
          {
            type: 'text',
            id: 'marginBottom',
            label: 'Bottom (px)',
            default: marginBottom
            //  validate: CKEDITOR.dialog.validate.notEmpty("Explanation field cannot be empty.")
          },
          {
            type: 'text',
            id: 'marginLeft',
            label: 'Left (px)',
            default: marginLeft
            //validate: CKEDITOR.dialog.validate.notEmpty("Explanation field cannot be empty.")
          },
          {
            type: 'text',
            id: 'marginRight',
            label: 'Right (px)',
            default: marginRight
            //validate: CKEDITOR.dialog.validate.notEmpty("Explanation field cannot be empty.")
          },
          {
            type: 'button',
            id: 'btnUp',
            style: 'width:100%;',
            label: 'Reset to default',
            title: editor.lang.forms.select.btnUp,
            onClick: function () {
              marginTop = 62;
              marginBottom = 62;
              marginLeft = 48;
              marginRight = 48;
              var dialog = this.getDialog();
              if (marginTop) {
                dialog.setValueOf('set-margin', 'marginTop', marginTop);
              }
              if (marginBottom) {
                dialog.setValueOf('set-margin', 'marginBottom', marginBottom)
              }
              if (marginTop) {
                dialog.setValueOf('set-margin', 'marginLeft', marginLeft);
              }
              if (marginBottom) {
                dialog.setValueOf('set-margin', 'marginRight', marginRight)
              }
            }
          },
        ]
      }
    ],

    onShow: function () {
      var marginTop = null;
      var marginBottom = null;
      var marginLeft = null;
      var marginRight = null;
      var parser = new DOMParser();
      var element = parser.parseFromString(editor.getData(), 'text/html');
      var marginDiv = element.getElementById('leegality-margin-division');
      if (marginDiv) {
        marginTop = marginDiv.getAttribute('margin-top');
        marginBottom = marginDiv.getAttribute('margin-bottom');
        marginLeft = marginDiv.getAttribute('margin-left');
        marginRight = marginDiv.getAttribute('margin-right');
      }
      if (marginTop) {
        this.setValueOf('set-margin', 'marginTop', marginTop);
      }
      if (marginBottom) {
        this.setValueOf('set-margin', 'marginBottom', marginBottom)
      }
      if (marginTop) {
        this.setValueOf('set-margin', 'marginLeft', marginLeft);
      }
      if (marginBottom) {
        this.setValueOf('set-margin', 'marginRight', marginRight)
      }
    },


    onOk: function () {
      var dialog = this;
      var check = false;
      var div = editor.document.createElement('div');
      div.setHtml('<p></p>');
      if (editor.document.getById('leegality-margin-division') != null) {
        div = editor.document.getById('leegality-margin-division');
        check = true;
      } else {
        div.setAttribute('id', 'leegality-margin-division');
        div.setAttribute('class', 'pageMargin');
      }
      var margin = editor.document.createElement('leegality-margin-division');
      if (editor.document.getById('leegality-margin') != null) {
        margin = editor.document.getById('leegality-margin');
      } else {
        margin.setAttribute('id', 'leegality-margin');
        editor.insertElement(margin)
      }
      var style = '';
      if (dialog.getValueOf('set-margin', 'marginTop')) {
        style = style + 'margin-top:' + dialog.getValueOf('set-margin', 'marginTop') + 'px;';
        div.setAttribute('margin-top', dialog.getValueOf('set-margin', 'marginTop'));
        margin.setAttribute('margin-top', dialog.getValueOf('set-margin', 'marginTop'))
      }
      if (dialog.getValueOf('set-margin', 'marginBottom')) {
        style = style + 'margin-bottom:' + dialog.getValueOf('set-margin', 'marginBottom') + 'px;';
        div.setAttribute('margin-bottom', dialog.getValueOf('set-margin', 'marginBottom'));
        margin.setAttribute('margin-bottom', dialog.getValueOf('set-margin', 'marginBottom'))

      }
      if (dialog.getValueOf('set-margin', 'marginLeft')) {
        style = style + 'margin-left:' + dialog.getValueOf('set-margin', 'marginLeft') + 'px;';
        div.setAttribute('margin-left', dialog.getValueOf('set-margin', 'marginLeft'));
        margin.setAttribute('margin-left', dialog.getValueOf('set-margin', 'marginLeft'));

      }
      if (dialog.getValueOf('set-margin', 'marginRight')) {
        style = style + 'margin-right:' + dialog.getValueOf('set-margin', 'marginRight') + 'px;';
        div.setAttribute('margin-right', dialog.getValueOf('set-margin', 'marginRight'));
        margin.setAttribute('margin-right', dialog.getValueOf('set-margin', 'marginRight'));

      }


      div.setAttribute('style', style);
      if (!check) {
        if (editor.getData()) {
          div.setHtml(editor.getData())
        }
        editor.setData(div.$.outerHTML)
      }


    }
  };
});
