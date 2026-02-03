/**
 * @license Copyright (c) 2003-2018, CKSource - Frederico Knabben. All rights reserved.
 * For licensing, see LICENSE.md or https://ckeditor.com/legal/ckeditor-oss-license
 */

CKEDITOR.dialog.add('radio', function (editor) {
  var checkboxArray = ["New Group"];

  function getLastRadio() {
    return editor.document.find("input[type='radio']").toArray().slice(-1)[0];
  }

  return {
    title: "Add a New Radio Button",
    minWidth: 350,
    minHeight: 140,
    onShow: function () {
      delete this.radioButton;
      var element = this.getParentEditor().getSelection().getSelectedElement();
      if (element && element.getName() == 'input' && element.getAttribute('type') == 'radio') {
        this.radioButton = element;
      }
      this.setupContent(element);
    },
    onOk: function () {
      var editor,
        element = this.radioButton,
        isInsertMode = !element;

      if (isInsertMode) {
        editor = this.getParentEditor();
        element = editor.document.createElement('input');
        element.setAttribute('type', 'radio');
        element.setAttribute('class', 'leegality-radio');
        element.setAttribute("id", new Date().getTime());
        editor.insertElement(element);
      }

      this.commitContent({element: element});
    },
    contents: [
      {
        id: 'basic-tab',
        label: "Basic",
        title: "Basic",
        elements: [
          {
            id: 'groupSelect',
            type: 'select',
            width: '100%',
            label: 'Select Group',
            items: [],
            default: "New Group",
            onLoad: function () {
              this.add(checkboxArray[0])
            },
            onShow: function () {
              var parser = new DOMParser();
              var parserElement = parser.parseFromString(editor.getData(), 'text/html');
              var checkbox = parserElement.getElementsByClassName('leegality-radio');
              var i;
              for (i = 0; i < checkbox.length; i++) {
                if (checkboxArray.indexOf(checkbox[i].name) === -1) {
                  checkboxArray.push(checkbox[i].name);
                  this.add(checkbox[i].name);
                }
              }
            },
            onChange: function () {
              var value = this.getValue();
              if (value !== 'New Group') {
                this.getDialog().getContentElement('basic-tab', 'name').setValue(value);
              }
            },
            setup: function (element) {
              if (element) {
                this.setValue(element.getAttribute('name'));
              }
            },
          },
          {
            id: 'name',
            type: 'text',
            label: "Group Name(required)",
            'default': '',
            validate: function () {
              if (!this.getValue() || !this.getValue().trim()) {
                alert("Group Name can not be blank");
                return false;
              }
              if (this.getDialog().getContentElement('basic-tab', 'groupSelect').getValue() === "New Group" && checkboxArray.includes(this.getValue())) {
                alert("Group Name already in use");
                return false;
              }
            },
            accessKey: 'N',
            setup: function (element) {
              if (element) {
                this.setValue(element.data('cke-saved-name') || element.getAttribute('name') || '');
              }
            },
            commit: function (data) {
              var element = data.element;

              if (this.getValue()) {
                element.data('cke-saved-name', this.getValue());
                element.setAttribute("name", this.getValue());
              } else {
                element.data('cke-saved-name', false);
                element.removeAttribute('name');
              }
            }
          },
          {
            id: 'value',
            type: 'text',
            label: "Value(required)",
            'default': '',
            accessKey: 'V',
            validate: function () {
              if (!this.getValue() || !this.getValue().trim()) {
                alert("Value can not be blank");
                return false;
              }
            },
            setup: function (element) {
              if (element) {
                this.setValue(element.getAttribute('value') || '');
              }
            },
            commit: function (data) {
              var element = data.element;

              if (this.getValue())
                element.setAttribute('value', this.getValue());
              else
                element.removeAttribute('value');
            }
          }
        ]
      },
      {
        id: 'advanced-tab',
        label: "More Options",
        title: "More Options",
        elements: [
          {
            id: 'checked',
            type: 'checkbox',
            label: "Keep selected by default",
            'default': '',
            accessKey: 'S',
            value: 'checked',
            setup: function (element) {
              if (element) {
                this.setValue(element.getAttribute('checked'));
              }
            },
            commit: function (data) {
              var element = data.element;

              if (!CKEDITOR.env.ie) {
                var value = this.getValue();
                // Blink/Webkit needs to change checked property, not attribute. (https://dev.ckeditor.com/ticket/12465)
                if (CKEDITOR.env.webkit) {
                  element.$.checked = value;
                  element.$.defaultChecked = value;
                }

                if (value) {
                  element.setAttribute('checked', 'checked');
                  element.setAttribute('defaultChecked', 'checked');
                } else {
                  element.removeAttribute('checked');
                  element.removeAttribute('defaultChecked');
                }
              } else {
                var isElementChecked = element.getAttribute('checked');
                var isChecked = !!this.getValue();

                if (isElementChecked != isChecked) {
                  var replace = CKEDITOR.dom.element.createFromHtml('<input type="radio"' + (isChecked ? ' checked="checked"' : '') +
                    '></input>', editor.document);
                  element.copyAttributes(replace, {type: 1, checked: 1});
                  replace.replace(element);

                  // Ugly hack which fix IE issues with radiobuttons (#834).
                  if (isChecked) {
                    replace.setAttribute('checked', 'checked');
                  }

                  editor.getSelection().selectElement(replace);
                  data.element = replace;
                }
              }
            }
          },
          {
            id: 'required',
            type: 'checkbox',
            label: "Make field mandatory",
            'default': '',
            accessKey: 'Q',
            value: 'required',
            setup: function (element) {
              if (element) {
                this.setValue(element.hasAttribute('required'));
              }
            },
            commit: function (data) {
              var element = data.element;
              if (this.getValue())
                element.setAttribute('required', 'required');
              else
                element.removeAttribute('required');
            }
          }
        ]
      }
    ]
  };
});
