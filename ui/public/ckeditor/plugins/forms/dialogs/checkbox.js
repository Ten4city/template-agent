/**
 * @license Copyright (c) 2003-2018, CKSource - Frederico Knabben. All rights reserved.
 * For licensing, see LICENSE.md or https://ckeditor.com/legal/ckeditor-oss-license
 */

CKEDITOR.dialog.add('checkbox', function (editor) {
  var checkboxArray = ["New Group"];
  return {
    title: 'Add a New Checkbox',
    minWidth: 350,
    minHeight: 140,
    onShow: function () {
      delete this.checkbox;
      var element = this.getParentEditor().getSelection().getSelectedElement();

      if (element && element.getAttribute('type') == 'checkbox') {
        this.checkbox = element;
        this.setupContent(element);
      }
    },
    onOk: function () {
      var editor,
        element = this.checkbox,
        isInsertMode = !element;

      if (isInsertMode) {
        editor = this.getParentEditor();
        element = editor.document.createElement('input');
        element.setAttribute('type', 'checkbox');
        element.setAttribute('class', 'leegality-checkbox');
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
        startupFocus: 'txtName',
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
              var checkbox = parserElement.getElementsByClassName('leegality-checkbox');
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
                this.getDialog().getContentElement('basic-tab', 'txtName').setValue(value);
              }
            },

          },
          {
            id: 'txtName',
            type: 'text',
            label: 'Group name(required)',
            'default': '',
            accessKey: 'N',
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
            setup: function (element) {
              this.setValue(element.data('cke-saved-name') || element.getAttribute('name') || '');
            },
            commit: function (data) {
              var element = data.element;

              // IE failed to update 'name' property on input elements, protect it now.
              if (this.getValue()) {
                element.data('cke-saved-name', this.getValue());
                element.setAttribute('name', this.getValue());
              } else {
                element.data('cke-saved-name', false);
                element.removeAttribute('name');
              }
            }
          },
          {
            id: 'txtValue',
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
              var value = element.getAttribute('value');
              // IE Return 'on' as default attr value.
              this.setValue(CKEDITOR.env.ie && value == 'on' ? '' : value);
            },
            commit: function (data) {
              var element = data.element,
                value = this.getValue();

              if (value && !(CKEDITOR.env.ie && value == 'on'))
                element.setAttribute('value', value);
              else {
                if (CKEDITOR.env.ie) {
                  // Remove attribute 'value' of checkbox (https://dev.ckeditor.com/ticket/4721).
                  var checkbox = new CKEDITOR.dom.element('input', element.getDocument());
                  element.copyAttributes(checkbox, {value: 1});
                  checkbox.replace(element);
                  editor.getSelection().selectElement(checkbox);
                  data.element = checkbox;
                } else {
                  element.removeAttribute('value');
                }
              }
            }
          }
        ]
      },
      {
        id: 'advanced-tab',
        label: "More Options",
        title: "More Option",
        startupFocus: 'cmbSelected',
        elements: [
          {
            id: 'cmbSelected',
            type: 'checkbox',
            label: "Keep selected by default",
            'default': '',
            accessKey: 'S',
            value: 'checked',
            setup: function (element) {
              this.setValue(element.getAttribute('checked'));
            },
            commit: function (data) {
              var element = data.element;

              if (CKEDITOR.env.ie) {
                var isElementChecked = !!element.getAttribute('checked'),
                  isChecked = !!this.getValue();

                if (isElementChecked != isChecked) {
                  var replace = CKEDITOR.dom.element.createFromHtml('<input type="checkbox"' + (isChecked ? ' checked="checked"' : '') +
                    '/>', editor.document);

                  element.copyAttributes(replace, {type: 1, checked: 1});
                  replace.replace(element);
                  editor.getSelection().selectElement(replace);
                  data.element = replace;
                }
              } else {
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
            setup: CKEDITOR.plugins.forms._setupRequiredAttribute,
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
