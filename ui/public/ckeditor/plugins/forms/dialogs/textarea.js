/**
 * @license Copyright (c) 2003-2018, CKSource - Frederico Knabben. All rights reserved.
 * For licensing, see LICENSE.md or https://ckeditor.com/legal/ckeditor-oss-license
 */
CKEDITOR.dialog.add('textarea', function (editor) {
  var textboxArray = ["New Group"];
  var columnArray = [""];
  var rowArray = [""];
  var requiredArray = [""];
  return {
    title: 'Add a New Large Textbox',
    minWidth: 350,
    minHeight: 220,
    onShow: function () {
      delete this.textarea;

      var element = this.getParentEditor().getSelection().getSelectedElement();
      if (element && element.getName() == 'textarea') {
        this.textarea = element;
        this.setupContent(element);
      }
    },
    onOk: function () {
      var editor,
        element = this.textarea,
        isInsertMode = !element;

      if (isInsertMode) {
        editor = this.getParentEditor();
        element = editor.document.createElement('textarea');
      }
      this.commitContent(element);

      if (isInsertMode) {
        element.setAttribute('class', 'leegality-textarea');
        element.setAttribute("id", new Date().getTime());
        editor.insertElement(element);
      }
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
              this.add(textboxArray[0])
            },
            onShow: function () {
              var parser = new DOMParser();
              var parserElement = parser.parseFromString(editor.getData(), 'text/html');
              var textArea = parserElement.getElementsByClassName('leegality-textarea');
              var i;
              for (i = 0; i < textArea.length; i++) {
                if (textArea[i].hasAttribute("groupselect") && textboxArray.indexOf(textArea[i].getAttribute("groupselect")) === -1) {
                  textboxArray.push(textArea[i].getAttribute("groupselect"));
                  if (textArea[i].hasAttribute("required")) {
                    requiredArray.push("required");
                  }
                  if (textArea[i].hasAttribute("cols")) {
                    columnArray.push(textArea[i].getAttribute("cols"));
                  } else {
                    columnArray.push("");
                  }
                  if (textArea[i].hasAttribute("rows")) {
                    rowArray.push(textArea[i].getAttribute("rows"));
                  } else {
                    rowArray.push("");
                  }
                  this.add(textArea[i].getAttribute("groupselect"));
                }
              }
            },
            onChange: function () {
              var value = this.getValue();
              if (value !== 'New Group') {
                this.getDialog().getContentElement('basic-tab', 'txtName').setValue(value);
                var columnValue = columnArray[textboxArray.indexOf(this.getValue())]
                if (columnValue !== "") {
                  this.getDialog().getContentElement('advanced-tab', 'cols').setValue(columnValue);
                }
                var rowValue = rowArray[textboxArray.indexOf(this.getValue())]
                if (rowValue !== "") {
                  this.getDialog().getContentElement('advanced-tab', 'rows').setValue(rowValue);
                }
                var requiredValue = requiredArray[textboxArray.indexOf(this.getValue())]
                if (requiredValue !== "") {
                  this.getDialog().getContentElement('advanced-tab', 'required').setValue(requiredValue);
                }
              }
            },

          },
          {
            id: 'txtName',
            type: 'text',
            label: 'Group name',
            'default': '',
            accessKey: 'N',
            validate: function () {
              if (this.getDialog().getContentElement('basic-tab', 'groupSelect').getValue() === "New Group" && textboxArray.includes(this.getValue())) {
                alert("Group Name already in use");
                return false;
              }
            },
            setup: function (element) {
              this.setValue(element.getAttribute('groupselect') || '');
            },
            commit: function (element) {
              // var element = data.element;

              // IE failed to update 'name' property on input elements, protect it now.
              if (this.getValue()) {
                element.setAttribute('groupselect', this.getValue());
              } else {
                element.removeAttribute('groupselect');
              }
            }
          },
          {
            id: '_cke_saved_name',
            type: 'text',
            label: editor.lang.common.name + '(required)',
            'default': '',
            accessKey: 'N',
            validate: function () {
              if (!this.getValue() || !this.getValue().trim()) {
                alert('Name can not be blank.');
                return false;
              }
            },
            setup: function (element) {
              this.setValue(element.data('cke-saved-name') || element.getAttribute('name') || '');
            },
            commit: function (element) {
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
            id: 'placeholder',
            type: 'text',
            label: 'Placeholder',
            'default': '',
            setup: function (element) {
              element.setAttribute("placeholder", element.getAttribute("placeholder"));
              this.setValue(element.getAttribute("placeholder"));
            },
            commit: function (element) {
              // element.$.value = element.$.defaultValue = this.getValue();
              element.setAttribute("placeholder", this.getValue());
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
            type: 'hbox',
            widths: ['50%', '50%'],
            children: [{
              id: 'cols',
              type: 'text',
              label: editor.lang.forms.textarea.cols,
              'default': '',
              accessKey: 'C',
              style: 'width:50px',
              validate: CKEDITOR.dialog.validate.integer(editor.lang.common.validateNumberFailed),
              setup: function (element) {
                var value = element.hasAttribute('cols') && element.getAttribute('cols');
                this.setValue(value || '');
              },
              commit: function (element) {
                if (this.getValue())
                  element.setAttribute('cols', this.getValue());
                else
                  element.removeAttribute('cols');
              }
            },
              {
                id: 'rows',
                type: 'text',
                label: editor.lang.forms.textarea.rows,
                'default': '',
                accessKey: 'R',
                style: 'width:50px',
                validate: CKEDITOR.dialog.validate.integer(editor.lang.common.validateNumberFailed),
                setup: function (element) {
                  var value = element.hasAttribute('rows') && element.getAttribute('rows');
                  this.setValue(value || '');
                },
                commit: function (element) {
                  if (this.getValue())
                    element.setAttribute('rows', this.getValue());
                  else
                    element.removeAttribute('rows');
                }
              }]
          },
          {
            id: 'required',
            type: 'checkbox',
            label: 'Mandatory Field',
            'default': '',
            accessKey: 'Q',
            value: 'required',
            setup: CKEDITOR.plugins.forms._setupRequiredAttribute,
            commit: function (element) {
              if (this.getValue()) {
                element.setAttribute('required', 'required');
                element.setAttribute('pattern', '.*\\S+.*');
                element.setAttribute('data-rule-nospace', 'true');
              } else {
                element.removeAttribute('required');
                element.removeAttribute('pattern');
                element.removeAttribute('data-rule-nospace');
              }
            }
          }
        ]
      }
    ]
  };
});
