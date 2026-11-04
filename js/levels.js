/* levels.js — уровни, повторяющие раскладку со скриншотов (lvls/frontpic*.jpg).
 * Поле 1600x900, базовая земля GY=820. terrain — земляные насыпи.
 * helpers: column(колонна от базы), slab(перекрытие над колоннами), crate(куб). */
(function (global) {
  'use strict';

  var GY = 820;

  function column(mat, x, w, h, baseY) {
    var base = baseY === undefined ? GY : baseY;
    return { mat: mat, x: x, y: base - h / 2, w: w, h: h };
  }
  function slab(mat, x1, x2, h, colH, baseY) {
    var base = baseY === undefined ? GY : baseY;
    var top = base - colH;
    return { mat: mat, x: (x1 + x2) / 2, y: top - h / 2, w: (x2 - x1) + 90, h: h };
  }
  function crate(mat, x, s, baseY) {
    var base = baseY === undefined ? GY : baseY;
    return { mat: mat, x: x, y: base - s / 2, w: s, h: s };
  }
  /* насыпь: прямоугольник-холм, верх на baseY */
  function mound(x, w, h, baseY) {
    var base = baseY === undefined ? GY : baseY;
    return { x: x, y: base - h / 2, w: w, h: h };
  }

  var LEVELS = [
    {
      name: '1. Застава у ручья',
      hint: 'Три домика на холме — как на классной фотке',
      birds: 3,
      build: function () {
        var L = [], E = [];
        var HILL = mound(1290, 760, 170);
        var B = GY - 170; // верх холма = 650
        // левое крыло: стекло + камень на крыше
        L.push(column('ice', 1000, 40, 220, B));
        L.push(column('ice', 1120, 40, 220, B));
        L.push(slab('ice', 1000, 1120, 32, 220, B));
        L.push(crate('stone', 1030, 40, B - 252));
        L.push(crate('stone', 1090, 40, B - 252));
        E.push({ x: 1060, y: B - 28, acc: 'cap' });
        // центральная высокая башня
        L.push(column('wood', 1230, 44, 290, B));
        L.push(column('wood', 1350, 44, 290, B));
        L.push(slab('wood', 1230, 1350, 30, 290, B));
        L.push(column('ice', 1250, 38, 60, B - 320));
        L.push(column('ice', 1330, 38, 60, B - 320));
        L.push(slab('ice', 1250, 1330, 26, 60, B - 320));
        L.push(crate('stone', 1290, 44, B - 406));
        E.push({ x: 1290, y: B - 28, acc: 'helmet' });
        // правое крыло
        L.push(column('ice', 1460, 40, 220, B));
        L.push(column('ice', 1580, 40, 220, B));
        L.push(slab('ice', 1460, 1580, 32, 220, B));
        L.push(crate('stone', 1490, 40, B - 252));
        L.push(crate('stone', 1550, 40, B - 252));
        E.push({ x: 1520, y: B - 28, acc: 'cap' });
        return { blocks: L, enemies: E, terrain: [HILL] };
      }
    },
    {
      name: '2. Стеклянный город',
      hint: 'Камень снизу, стекло сверху, копов много',
      birds: 4,
      build: function () {
        var L = [], E = [];
        // каменное основание
        L.push(column('stone', 1060, 48, 130));
        L.push(column('stone', 1180, 48, 130));
        L.push(slab('stone', 1060, 1180, 36, 130));
        // стеклянная башня на основании
        L.push(column('ice', 1080, 40, 240, GY - 166));
        L.push(column('ice', 1240, 40, 240, GY - 166));
        L.push(slab('ice', 1080, 1240, 30, 240, GY - 166));
        E.push({ x: 1160, y: GY - 166 - 268, acc: 'bunny' }); // на самой макушке
        E.push({ x: 1160, y: GY - 28, acc: 'cap' });
        // каменная башня справа
        L.push(column('stone', 1320, 52, 190));
        L.push(column('stone', 1450, 52, 190));
        L.push(slab('stone', 1320, 1450, 40, 190));
        L.push(column('stone', 1345, 44, 90, GY - 230));
        L.push(column('stone', 1425, 44, 90, GY - 230));
        L.push(slab('stone', 1345, 1425, 34, 90, GY - 230));
        E.push({ x: 1385, y: GY - 28, acc: 'straw' });
        E.push({ x: 1385, y: GY - 230 - 124 - 28, acc: 'helmet' });
        return { blocks: L, enemies: E, terrain: [] };
      }
    },
    {
      name: '3. Дерево у тёмной горы',
      hint: 'Деревянная пагода и тёмный холм',
      birds: 4,
      build: function () {
        var L = [], E = [];
        var HILL = mound(1390, 440, 320);
        // ярус 1
        L.push(column('wood', 1010, 46, 170));
        L.push(column('wood', 1130, 46, 170));
        L.push(slab('wood', 1010, 1130, 34, 170));
        E.push({ x: 1070, y: GY - 28, acc: 'cap' });
        // ярус 2
        L.push(column('wood', 1015, 40, 140, GY - 204));
        L.push(column('wood', 1125, 40, 140, GY - 204));
        L.push(slab('wood', 1015, 1125, 30, 140, GY - 204));
        E.push({ x: 1070, y: GY - 204 - 28, acc: 'straw' });
        // ярус 3
        L.push(column('wood', 1040, 36, 120, GY - 374));
        L.push(column('wood', 1100, 36, 120, GY - 374));
        L.push(slab('wood', 1040, 1100, 28, 120, GY - 374));
        E.push({ x: 1070, y: GY - 374 - 148 - 28, acc: 'straw' });
        // на тёмном холме
        L.push(column('wood', 1350, 40, 90, GY - 320));
        L.push(column('wood', 1430, 40, 90, GY - 320));
        L.push(slab('wood', 1350, 1430, 30, 90, GY - 320));
        E.push({ x: 1390, y: GY - 320 - 28, acc: 'cap' });
        E.push({ x: 1390, y: GY - 320 - 120 - 28, acc: 'helmet' });
        return { blocks: L, enemies: E, terrain: [HILL] };
      }
    },
    {
      name: '4. Два холма',
      hint: 'Копы расселились по обоим холмам',
      birds: 4,
      build: function () {
        var L = [], E = [];
        var H1 = mound(1150, 480, 150);
        var H2 = mound(1500, 360, 220);
        var B1 = GY - 150, B2 = GY - 220;
        // левый холм: дерево + стекло, коп внизу и на макушке
        L.push(column('wood', 1060, 44, 150, B1));
        L.push(column('wood', 1180, 44, 150, B1));
        L.push(slab('ice', 1060, 1180, 30, 150, B1));
        L.push(crate('stone', 1090, 40, B1 - 180));
        L.push(crate('stone', 1150, 40, B1 - 180));
        L.push(column('ice', 1090, 36, 70, B1 - 220));
        L.push(column('ice', 1150, 36, 70, B1 - 220));
        L.push(slab('ice', 1090, 1150, 24, 70, B1 - 220));
        E.push({ x: 1120, y: B1 - 28, acc: 'cap' });
        E.push({ x: 1120, y: B1 - 314 - 28, acc: 'helmet' });
        // правый холм
        L.push(column('wood', 1440, 46, 120, B2));
        L.push(column('wood', 1560, 46, 120, B2));
        L.push(slab('wood', 1440, 1560, 30, 120, B2));
        E.push({ x: 1500, y: B2 - 28, acc: 'cap' });
        E.push({ x: 1500, y: B2 - 150 - 28, acc: 'straw' });
        return { blocks: L, enemies: E, terrain: [H1, H2] };
      }
    }
  ];

  global.LEVELS = LEVELS;
  global.GROUND_Y = GY;
  global.buildLevel = function (i) {
    var src = LEVELS[i];
    var built = src.build();
    return {
      name: src.name, birds: src.birds, hint: src.hint,
      blocks: built.blocks, enemies: built.enemies, terrain: built.terrain || []
    };
  };
})(window);
