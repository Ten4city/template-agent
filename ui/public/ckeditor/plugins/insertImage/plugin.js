var dialogName = "insertImageDialog";

CKEDITOR.plugins.add('insertImage', {
  icons: 'insertImage',
  init: function (editor) {
    editor.addCommand('insertImageFile', new CKEDITOR.dialogCommand(dialogName));
    editor.ui.addButton('InsertImage', {
      label: 'Upload Image Button',
      command: 'insertImageFile',
      toolbar: 'forms'
    });

    editor.on('doubleclick', function (evt) {
      var element = evt.data.element;
      var type = element.getAttribute('type');
      var dialog = element.data("dialog-name");
      if (dialog === dialogName) {
        switch (type) {
          case 'file':
            evt.data.dialog = 'insertImageDialog';
            break;
        }
      }
    });

    if (editor.contextMenu) {
      editor.addMenuGroup('insertImageGroup');
      editor.addMenuItem('insertImageItem', {
        label: 'Image Properties',
        icon: this.path + 'icons/insertImage.png',
        command: 'insertImageFile',
        group: 'insertImageGroup'

      });

      editor.contextMenu.addListener(function (element) {
        var type = element.getAttribute('type');
        var dialog = element.data("dialog-name");
        if (dialog === dialogName) {
          if (type === "file") {
            return {insertImageItem: CKEDITOR.TRISTATE_OFF};
          }
        }
      });
    }
    editor.setKeystroke([[CKEDITOR.CTRL + CKEDITOR.SHIFT + 73, "insertImageFile"]])
  }
});

CKEDITOR.dialog.add(dialogName, function (editor) {
  return {
    title: 'Add a New Upload Image Button',
    resizable: CKEDITOR.DIALOG_RESIZE_BOTH,
    minWidth: 350,
    minHeight: 250,
    contents: [
      {
        id: "imageAttributes",
        label: "Basic",
        accessKey: 'F',
        elements: [
          {
            type: 'text',
            label: 'Image Field Name(required, unique)',
            id: "name",
            validate: function () {
              if (!this.getValue() || !this.getValue().trim()) {
                alert('Name can not be blank.');
                return false;
              }
            },
            setup: function (element) {
              if (element) {
                this.setValue(element.getAttribute('name') || '');
              }
            },
            commit: function (element) {
              var value = this.getValue();
              if (value) {
                var clazz = "form-image-" + Date.now();
                element.setAttribute("name", value);
                element.setAttribute("class", clazz);
                element.data("class", clazz);
              }
            }
          },
          {
            type: 'text',
            label: 'Width (required, in px)',
            id: "width",
            default: "120",
            validate: function () {
              if (!this.getValue() || !this.getValue().trim()) {
                alert('Width cannot be empty.');
                return false;
              } else if (!new RegExp(/^\d+$/).test(this.getValue().trim())) {
                alert('Width value must be a number.');
                return false;
              }
            },
            setup: function (element) {
              if (element) {
                var value = element.data("width");
                this.setValue(value);
              }
            },
            commit: function (element) {
              if (this.getValue()) {
                element.data("width", this.getValue())
              } else {
                element.data("width", "120");
              }
            }
          },
          {
            type: 'text',
            label: 'Height (optional, in px)',
            id: 'height',
            default: 'auto',
            setup: function (element) {
              if (element) {
                var value = element.data("height");
                this.setValue(value);
              }
            },
            commit: function (element) {
              if (this.getValue()) {
                element.data("height", this.getValue())
              } else {
                element.data("height", "auto");
              }
            }
          },
          {
            type: 'select',
            id: 'alignment',
            label: 'Alignment',
            style: 'width:100%',
            items: [['None', 'none'], ['Left', 'left'], ['Right', 'right'], ['Centre', 'centre']],
            'default': 'none',
            setup: function (element) {
              if (element) {
                var value = element.data("align");
                this.setValue(value || 'none');
              }
            },
            commit: function (element) {
              if (this.getValue() !== "none") {
                element.data("align", this.getValue())
              } else {
                element.data("align", false);
                element.removeAttribute("data-align");
              }
            }
          },
        ]
      },
      {
        id: "advanced-tab",
        label: "More Options",
        title: "More Options",
        elements: [
          {
            type: 'text',
            id: 'size',
            label: 'Maximum Uplaod File Size (KB)',
            'default': '512',
            validate: function () {
              if (!new RegExp(/^[0-9]+$/).test(this.getValue())) {
                alert("Size is not a number");
                return false;
              } else if (this.getValue() && parseInt(this.getValue()) > parseInt(3072)) {
                alert("Size can not be greater than 3MB");
                return false
              }
            },
            setup: function (element) {
              if (element) {
                var value = element.data("size");
                this.setValue(value || this['default']);
              }
            },
            commit: function (element) {
              element.data("size", this.getValue() || this['default'])
            }
          },
          {
            type: 'html',
            html: '<br/><span>' + 'Picture Quality :' + '</span>'
          },

          {
            type: 'text',
            id: 'minWidth',
            label: 'Minimum Upload File Width (px)',
            'default': '',
            setup: function (element) {
              if (element) {
                var value = element.data("min-width");
                this.setValue(value | '');
              }
            },
            commit: function (element) {
              if (this.getValue()) {
                element.data("min-width", this.getValue())
              } else {
                element.data("min-width", false);
                element.removeAttribute("data-min-width");
              }
            }
          },
          {
            type: 'text',
            id: 'maxWidth',
            label: 'Maximum Upload File Width (px)',
            'default': '',
            setup: function (element) {
              if (element) {
                var value = element.data("max-width");
                this.setValue(value | '');
              }
            },
            commit: function (element) {
              if (this.getValue()) {
                element.data("max-width", this.getValue())
              } else {
                element.data("max-width", false);
                element.removeAttribute("data-max-width");
              }
            }
          },
          {
            type: 'checkbox',
            id: 'required',
            label: 'Mandatory Field',
            default: false,
            setup: CKEDITOR.plugins.forms._setupRequiredAttribute,
            commit: function (element) {
              if (this.getValue()) {
                element.setAttribute("required", true)
              } else {
                element.removeAttribute("required");
              }
            }
          }

        ]


      }
    ],
    onShow: function () {
      delete this.insertImage;
      var element = this.getParentEditor().getSelection().getSelectedElement();
      if (element) {
        this.insertImage = element;
        this.setupContent(element);
      }
    },
    onOk: function () {
      var dialog = this;
      var element = this.insertImage,
        isInsertMode = !element;

      if (isInsertMode) {
        element = editor.document.createElement("input");
        element.setAttribute("type", "file");
        element.setAttribute("accept", "image/jpeg,image/png,image/jpg");
        element.data("dialog-name", dialogName);
        element.setAttribute("id", new Date().getTime());
      }

      var style = 'vertical-align:middle;border:1px dotted lightgray;display:inline-block;';

      var width = dialog.getValueOf('imageAttributes', 'width');
      if (width) {
        style += "width:" + width + "px;"
      }

      var height = dialog.getValueOf('imageAttributes', 'height');
      if (height) {
        style += "height:" + height + "px;"
      } else {
        style += "height:auto;";
      }

      var alignment = dialog.getValueOf("imageAttributes", "alignment");
      if (alignment && alignment !== 'none') {
        style += 'float:' + alignment
      }

      element.setAttribute("style", style);
      if (isInsertMode) {
        editor.insertElement(element);
      }
      this.commitContent(element);
    }
  };
});
