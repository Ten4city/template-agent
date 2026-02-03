CKEDITOR = CKEDITOR || {};
CKEDITOR.editorConfig = function (config) {
  config.extraPlugins = 'forms,justify,pagebreak,tableresize,print,pastebase64,base64image,insertImage,font,indent,indentblock,liststyle,lineheight,colorbutton,panelbutton,colordialog,tabletools,pastetools,pastefromword,pastefromgdocs,margin,border,copyformatting';
  config.indentOffset = 25;
  config.line_height = "1;1.1;1.2;1.3;1.4;1.5;1.6;1.7;1.8;1.9;2";
  config.colorButton_colorsPerRow = 8;
  config.colorButton_colors =
    '000,800000,8B4513,2F4F4F,008080,000080,4B0082,696969,' +
    'B22222,A52A2A,DAA520,006400,40E0D0,0000CD,800080,808080,' +
    'F00,FF8C00,FFD700,008000,0FF,00F,EE82EE,A9A9A9,' +
    'FFA07A,FFA500,FFFF00,00FF00,AFEEEE,ADD8E6,DDA0DD,D3D3D3,' +
    'FFF0F5,FAEBD7,FFFFE0,F0FFF0,F0FFFF,F0F8FF,E6E6FA,FFF';
  config.colorButton_enableMore = true;

  config.toolbar = [
    {
      name: 'document',
      groups: ['mode', 'document', 'doctools'],
      items: ['Source', '-', 'Save', 'NewPage', '-', 'Templates']
    },
    {
      name: 'clipboard',
      groups: ['clipboard', 'undo'],
      items: ['Cut', 'Copy', '-', 'Undo', 'Redo']
    },
    {
      name: 'editing',
      groups: ['find', 'selection'],
      items: ['Find', 'Replace', '-', 'SelectAll']
    },
    {
      name: 'forms',
      items: ['Checkbox', 'Radio', 'TextField', 'Textarea', 'Select', 'InsertImage']
    },
    '/',
    {
      name: 'paragraph',
      groups: ['list', 'indent', 'blocks', 'align', 'bidi'],
      items: ['Margin', 'Border']
    },
    {name: 'links', items: ['Link', 'Unlink']},
    {
      name: 'insert',
      items: ['base64image', 'Flash', 'Table', 'HorizontalRule', 'Smiley', 'SpecialChar', 'PageBreak', 'Iframe']
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
      items: ['NumberedList', 'BulletedList', '-', 'Outdent', 'Indent', '-', 'CreateDiv', '-', 'JustifyLeft', 'JustifyCenter', 'JustifyRight', 'JustifyBlock', '-', 'BidiLtr', 'BidiRtl', 'Language']
    },
    {name: 'styles', items: ['Font', 'FontSize', 'lineheight']},
    {name: 'colors', items: ['TextColor', 'BGColor']},
    {name: 'tools', items: ['Maximize', 'ShowBlocks']},
    {name: 'others', items: ['-']}
  ];


  config.toolbarGroups = [
    {name: 'document', groups: ['mode', 'document', 'doctools']},
    {name: 'clipboard', groups: ['clipboard', 'undo']},
    {name: 'editing', groups: ['find', 'selection', 'editing', 'margin']},
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
    {name: 'others', groups: ['others']},
  ];
};
CKEDITOR.config.allowedContent = true;










/*
* Added method in tools utility which are using by pastetool plugin
*/

CKEDITOR.tools.array.find = function (array, fn, thisArg) {
  var length = array.length, i = 0;
  while (i < length) {
    if (fn.call(thisArg, array[i], i, array)) {
      return array[i];
    }
    i++;
  }
  return undefined;
};

CKEDITOR.tools.object.DONT_ENUMS = [
  'toString',
  'toLocaleString',
  'valueOf',
  'hasOwnProperty',
  'isPrototypeOf',
  'propertyIsEnumerable',
  'constructor'
];

CKEDITOR.tools.object.keys = function (obj) {
  var hasOwnProperty = Object.prototype.hasOwnProperty,
    keys = [],
    dontEnums = CKEDITOR.tools.object.DONT_ENUMS,
    isNotObject = !obj || typeof obj !== 'object';

  if (CKEDITOR.env.ie && CKEDITOR.env.version < 9 && isNotObject) {
    return createNonObjectKeys(obj);
  }

  for (var prop in obj) {
    keys.push(prop);
  }

  if (CKEDITOR.env.ie && CKEDITOR.env.version < 9) {
    for (var i = 0; i < dontEnums.length; i++) {
      if (hasOwnProperty.call(obj, dontEnums[i])) {
        keys.push(dontEnums[i]);
      }
    }
  }

  return keys;

  function createNonObjectKeys(value) {
    var keys = [],
      i;

    if (typeof value !== 'string') {
      return keys;
    }

    for (i = 0; i < value.length; i++) {
      keys.push(String(i));
    }

    return keys;
  }
};

CKEDITOR.tools.style.border = CKEDITOR.tools.createClass({
  $: function (props) {
    props = props || {};
    this.width = props.width;
    this.style = props.style;
    this.color = props.color;
    this._.normalize();
  },

  _: {
    normalizeMap: {
      color: [
        [/windowtext/g, 'black']
      ]
    },
    normalize: function () {
      for (var propName in this._.normalizeMap) {
        var val = this[propName];

        if (val) {
          this[propName] = CKEDITOR.tools.array.reduce(this._.normalizeMap[propName], function (cur, rule) {
            return cur.replace(rule[0], rule[1]);
          }, val);
        }
      }
    }
  },

  proto: {
    toString: function () {
      return CKEDITOR.tools.array.filter([this.width, this.style, this.color], function (item) {
        return !!item;
      }).join(' ');
    }
  },

  statics: {
    fromCssRule: function (value) {
      var props = {},
        input = value.split(/\s+/g),
        parseColor = CKEDITOR.tools.style.parse._findColor(value);

      if (parseColor.length) {
        props.color = parseColor[0];
      }

      CKEDITOR.tools.array.forEach(input, function (val) {
        if (!props.style) {
          if (CKEDITOR.tools.indexOf(CKEDITOR.tools.style.parse._borderStyle, val) !== -1) {
            props.style = val;
            return;
          }
        }

        if (!props.width) {
          if (CKEDITOR.tools.style.parse._widthRegExp.test(val)) {
            props.width = val;
            return;
          }
        }

      });

      return new CKEDITOR.tools.style.border(props);
    },

    splitCssValues: function (styles, fallback) {
      var types = ['width', 'style', 'color'],
        sides = ['top', 'right', 'bottom', 'left'];

      fallback = fallback || {};

      var stylesMap = CKEDITOR.tools.array.reduce(types, function (cur, type) {
        var style = styles['border-' + type] || fallback[type];

        cur[type] = style ? CKEDITOR.tools.style.parse.sideShorthand(style) : null;

        return cur;
      }, {});

      return CKEDITOR.tools.array.reduce(sides, function (cur, side) {
        var map = {};

        for (var style in stylesMap) {
          // Prefer property with greater specificity e.g
          // `border-top-color` over `border-color`.
          var sideProperty = styles['border-' + side + '-' + style];
          if (sideProperty) {
            map[style] = sideProperty;
          } else {
            map[style] = stylesMap[style] && stylesMap[style][side];
          }
        }

        cur['border-' + side] = new CKEDITOR.tools.style.border(map);

        return cur;
      }, {});
    }
  }
});
