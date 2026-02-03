CKEDITOR = CKEDITOR || {};
CKEDITOR.editorConfig = function (config) {
  config.extraPlugins = 'forms';

  config.toolbar = [
    {
      name: 'document',
      groups: ['mode', 'document', 'doctools'],
      items: ['Source', '-', 'Save', 'NewPage', 'Print', '-', 'Templates']
    },
    {
      name: 'clipboard',
      groups: ['clipboard', 'undo'],
      items: ['Cut', 'Copy', 'Paste', 'PasteText', 'PasteFromWord', '-', 'Undo', 'Redo']
    },
    {
      name: 'editing',
      groups: ['find', 'selection', 'spellchecker'],
      items: ['Find', 'Replace', '-', 'SelectAll', '-', 'Scayt']
    },
    {
      name: 'forms',
      items: ['Form', 'Checkbox', 'Radio', 'TextField', 'Textarea', 'Select', 'Button', 'ImageButton', 'HiddenField']
    },
    '/',
    {
      name: 'basicstyles',
      groups: ['basicstyles', 'cleanup'],
      items: ['Bold', 'Italic', 'Underline', 'Strike', 'Subscript', 'Superscript', '-', 'CopyFormatting', 'RemoveFormat']
    },
    {
      name: 'paragraph',
      groups: ['list', 'indent', 'blocks', 'align', 'bidi'],
      items: ['NumberedList', 'BulletedList', '-', 'Outdent', 'Indent', '-', 'Blockquote', 'CreateDiv', '-', 'JustifyLeft', 'JustifyCenter', 'JustifyRight', 'JustifyBlock', '-', 'BidiLtr', 'BidiRtl', 'Language']
    },
    {name: 'links', items: ['Link', 'Unlink', 'Anchor']},
    {
      name: 'insert',
      items: ['Image', 'Flash', 'Table', 'HorizontalRule', 'Smiley', 'SpecialChar', 'PageBreak', 'Iframe']
    },
    '/',
    {name: 'styles', items: ['Styles', 'Format', 'Font', 'FontSize']},
    {name: 'colors', items: ['TextColor', 'BGColor']},
    {name: 'tools', items: ['Maximize', 'ShowBlocks']},
    {name: 'others', items: ['-']}
  ];


  config.toolbarGroups = [
    {name: 'document', groups: ['mode', 'document', 'doctools']},
    {name: 'clipboard', groups: ['clipboard', 'undo']},
    {name: 'editing', groups: ['find', 'selection', 'spellchecker', 'editing']},
    {name: 'forms', groups: ['forms']},
    '/',
    {name: 'basicstyles', groups: ['basicstyles', 'cleanup']},
    {name: 'paragraph', groups: ['list', 'indent', 'blocks', 'align', 'bidi', 'paragraph']},
    {name: 'links', groups: ['links']},
    {name: 'insert', groups: ['insert']},
    '/',
    {name: 'styles', groups: ['styles']},
    {name: 'colors', groups: ['colors']},
    {name: 'tools', groups: ['tools']},
    {name: 'others', groups: ['others']}
  ];
};
