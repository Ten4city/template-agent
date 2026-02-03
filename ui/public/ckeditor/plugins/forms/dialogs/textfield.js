/**
 * @license Copyright (c) 2003-2018, CKSource - Frederico Knabben. All rights reserved.
 * For licensing, see LICENSE.md or https://ckeditor.com/legal/ckeditor-oss-license
 */
CKEDITOR.dialog.add('textfield', function (editor) {
  var textboxArray = ["New Group"];
  var maxLengthArray = [""];
  var typeArray = [""];
  var boxedArray = [""];
  var requiredArray = [""];
  var acceptedTypes = {email: 1, password: 1, search: 1, tel: 1, text: 1, url: 1};

  function autoCommit(data) {
    var element = data.element;
    var value = this.getValue();

    value ? element.setAttribute(this.id, value) : element.removeAttribute(this.id);
  }

  function autoSetup(element) {
    var value = element.hasAttribute(this.id) && element.getAttribute(this.id);
    this.setValue(value || '');
  }

  return {
    title: "Add a new Small Textbox",
    minWidth: 350,
    minHeight: 150,
    onShow: function () {
      delete this.textField;

      var element = this.getParentEditor().getSelection().getSelectedElement();
      if (element && element.getName() == 'input' && (acceptedTypes[element.getAttribute('type')] || !element.getAttribute('type'))) {
        this.textField = element;
        this.setupContent(element);
      }
    },
    onOk: function () {
      var editor = this.getParentEditor(),
        element = this.textField,
        isInsertMode = !element;

      if (isInsertMode) {
        element = editor.document.createElement('input');
        element.setAttribute('type', 'text');
        element.setAttribute('class', 'leegality-textbox');
      }

      var data = {element: element};

      if (isInsertMode) {
        element.setAttribute("id", new Date().getTime());
        editor.insertElement(data.element);
      }

      this.commitContent(data);

      // Element might be replaced by commitment.
      if (!isInsertMode)
        editor.getSelection().selectElement(data.element);
    },
    onLoad: function () {
      this.foreach(function (contentObj) {
        if (contentObj.getValue) {
          if (!contentObj.setup)
            contentObj.setup = autoSetup;
          if (!contentObj.commit)
            contentObj.commit = autoCommit;
        }
      });
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
              var textbox = parserElement.getElementsByClassName('leegality-textbox');
              var i;
              for (i = 0; i < textbox.length; i++) {
                if (textbox[i].hasAttribute("groupselect") && textboxArray.indexOf(textbox[i].getAttribute("groupselect")) === -1) {
                  textboxArray.push(textbox[i].getAttribute("groupselect"));
                  if (textbox[i].hasAttribute("maxlength")) {
                    maxLengthArray.push(textbox[i].getAttribute("maxlength"));
                  } else {
                    maxLengthArray.push("");
                  }
                  if (textbox[i].hasAttribute("type")) {
                    typeArray.push(textbox[i].getAttribute("type"));
                  } else {
                    typeArray.push("");
                  }
                  if (textbox[i].hasAttribute("required")) {
                    requiredArray.push("required");
                  }
                  if (textbox[i].hasAttribute("leegality-field")) {
                    boxedArray.push(textbox[i].getAttribute("leegality-field"));
                  } else {
                    boxedArray.push("");
                  }
                  this.add(textbox[i].getAttribute("groupselect"));
                }
              }
            },
            onChange: function () {
              var value = this.getValue();
              if (value !== 'New Group') {
                this.getDialog().getContentElement('basic-tab', 'txtName').setValue(value);
                var maxLengthValue = maxLengthArray[textboxArray.indexOf(this.getValue())]
                if (maxLengthValue !== "") {
                  this.getDialog().getContentElement('advanced-tab', 'maxLength').setValue(maxLengthValue);
                }
                var typeValue = typeArray[textboxArray.indexOf(this.getValue())]
                if (typeValue !== "") {
                  this.getDialog().getContentElement('advanced-tab', 'type').setValue(typeValue);
                }
                var requiredValue = requiredArray[textboxArray.indexOf(this.getValue())]
                if (requiredValue !== "") {
                  this.getDialog().getContentElement('advanced-tab', 'required').setValue(requiredValue);
                }
                var boxedValue = boxedArray[textboxArray.indexOf(this.getValue())]
                if (boxedValue !== "") {
                  this.getDialog().getContentElement('advanced-tab', 'leegality-field').setValue(boxedValue);
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
            commit: function (data) {
              var element = data.element;

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
            label: editor.lang.forms.textfield.name + "(required)",
            'default': '',
            accessKey: 'N',
            validate: function () {
              if (!this.getValue() || !this.getValue().trim()) {
                alert("Name can not be blank");
                return false;
              }
            },
            setup: function (element) {
              this.setValue(element.data('cke-saved-name') || element.getAttribute('name') || '');
            },
            commit: function (data) {
              var element = data.element;

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
            accessKey: 'V',
            commit: function (data) {
              if (CKEDITOR.env.ie && !this.getValue()) {
                var element = data.element,
                  fresh = new CKEDITOR.dom.element('input', editor.document);
                element.copyAttributes(fresh, {placeholder: 1});
                fresh.replace(element);
                data.element = fresh;
              } else {
                autoCommit.call(this, data);
              }
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
            children: [
              {
                id: 'maxLength',
                type: 'text',
                label: "Maximum Character Limit",
                'default': '',
                accessKey: 'M',
                style: 'width:126px',
                validate: CKEDITOR.dialog.validate.integer(editor.lang.common.validateNumberFailed),
                setup: function (element) {
                  this.setValue(element.getAttribute('maxlength') || '');
                },
                commit: function (data) {
                  var element = data.element;
                  if (this.getValue()) {
                    element.setAttribute('maxlength', this.getValue());
                  } else {
                    element.removeAttribute('maxlength')
                  }
                }
              },
              {
                id: 'type',
                type: 'select',
                label: editor.lang.forms.textfield.type,
                'default': 'text',
                accessKey: 'M',
                items: [
                  ['Number', 'number'],
                  ['Text', 'text'],

                ],
                setup: function (element) {
                  this.setValue(element.getAttribute('type'));
                },
                commit: function (data) {
                  var element = data.element;

                  if (CKEDITOR.env.ie) {
                    var elementType = element.getAttribute('type');
                    var myType = this.getValue();

                    if (elementType != myType) {
                      var replace = CKEDITOR.dom.element.createFromHtml('<input type="' + myType + '"></input>', editor.document);
                      element.copyAttributes(replace, {type: 1});
                      replace.replace(element);
                      data.element = replace;
                    }
                  } else {
                    element.setAttribute('type', this.getValue());
                  }
                }
              }

            ],
            onLoad: function () {
              // Repaint the style for IE7 (https://dev.ckeditor.com/ticket/6068)
              if (CKEDITOR.env.ie7Compat)
                this.getElement().setStyle('zoom', '100%');
            }
          },
          {
            id: 'required',
            type: 'checkbox',
            label: "Mandatory Field",
            'default': '',
            accessKey: 'Q',
            value: 'required',
            setup: CKEDITOR.plugins.forms._setupRequiredAttribute,
            commit: function (data) {
              var element = data.element;
              if (this.getValue()) {
                element.setAttribute('required', 'required');
                element.setAttribute('pattern', ".*\\S+.*");
              } else {
                element.removeAttribute('required');
                element.removeAttribute('pattern');
              }
            }
          },
          {
            id: 'leegality-field',
            type: 'checkbox',
            label: "Boxed field",
            'default': '',
            commit: function (data) {
              var element = data.element;
              if (this.getValue())
                element.setAttribute('leegality-field', 'boxed');
              else
                element.removeAttribute('leegality-field');
            }
          }
        ]
      }
    ]
  };
});
