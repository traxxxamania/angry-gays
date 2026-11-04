/* levels.js — данные уровней.
 * Поле 1600x900, верх земли y=820.
 * Строим «башнями»: b() — колонна от земли, p() — перекрытие по колонкам,
 * затем надстраиваем этажи. Координаты x — центры. */
(function (global) {
  'use strict';

  var GROUND_Y = 820;

  /* Помощники: возвращают блоки с уже посчитанным центром */
  function column(mat, x, w, h, baseY) {
    var base = baseY === undefined ? GROUND_Y : baseY;
    return { mat: mat, x: x, y: base - h / 2, w: w, h: h };
  }
  /* перекрытие между двумя колонками заданной высоты */
  function slab(mat, x1, x2, h, colH, baseY) {
    var base = baseY === undefined ? GROUND_Y : baseY;
    var top = base - colH;
    var w = (x2 - x1) + 90;
    return { mat: mat, x: (x1 + x2) / 2, y: top - h / 2, w: w, h: h };
  }
  /* ящик (стоячий куб) на указанной базе */
  function crate(mat, x, s, baseY) {
    var base = baseY === undefined ? GROUND_Y : baseY;
    return { mat: mat, x: x, y: base - s / 2, w: s, h: s };
  }

  var LEVELS = [
    {
      name: '1. Застава у ручья',
      birds: 3,
      hint: 'Разнеси оба домика',
      build: function () {
        var L = [], E = [];
        // левый домик: 2 колонны + перекрытие, коп под ним
        L.push(column('wood', 1060, 46, 170));
        L.push(column('wood', 1180, 46, 170));
        L.push(slab('wood', 1060, 1180, 36, 170));
        E.push({ x: 1120, y: GROUND_Y - 28 });
        // правый домик: лёд + дерево, коп внутри, коп на крыше
        L.push(column('ice', 1320, 42, 150));
        L.push(column('ice', 1430, 42, 150));
        L.push(slab('wood', 1320, 1430, 34, 150));
        E.push({ x: 1375, y: GROUND_Y - 28 });
        L.push(column('wood', 1350, 38, 90, GROUND_Y - 184));
        L.push(column('wood', 1400, 38, 90, GROUND_Y - 184));
        L.push(slab('ice', 1350, 1400, 28, 90, GROUND_Y - 184));
        E.push({ x: 1375, y: GROUND_Y - 184 - 90 - 28 - 28 });
        return { blocks: L, enemies: E };
      }
    },
    {
      name: '2. Ледяной патруль',
      birds: 3,
      hint: 'Лёд скользкий — используй это',
      build: function () {
        var L = [], E = [];
        // низкая платформа с копом сверху
        L.push(column('stone', 1000, 60, 120));
        L.push(column('stone', 1140, 60, 120));
        L.push(slab('stone', 1000, 1140, 40, 120));
        E.push({ x: 1070, y: GROUND_Y - 120 - 40 - 28 });
        // двухэтажная башня
        L.push(column('ice', 1300, 44, 200));
        L.push(column('ice', 1420, 44, 200));
        L.push(slab('wood', 1300, 1420, 34, 200));
        E.push({ x: 1360, y: GROUND_Y - 28 });
        L.push(column('wood', 1320, 40, 110, GROUND_Y - 234));
        L.push(column('wood', 1400, 40, 110, GROUND_Y - 234));
        L.push(slab('ice', 1320, 1400, 30, 110, GROUND_Y - 234));
        E.push({ x: 1360, y: GROUND_Y - 234 - 110 - 30 - 28 });
        return { blocks: L, enemies: E };
      }
    },
    {
      name: '3. Штаб-квартира СВИНЬ',
      birds: 4,
      hint: 'Три копа и ящик с взрывчаткой',
      build: function () {
        var L = [], E = [];
        // центральный форт
        L.push(column('stone', 1120, 60, 180));
        L.push(column('stone', 1260, 60, 180));
        L.push(slab('stone', 1120, 1260, 42, 180));
        E.push({ x: 1190, y: GROUND_Y - 28 });
        // башенка на форте
        L.push(column('wood', 1150, 40, 120, GROUND_Y - 222));
        L.push(column('wood', 1230, 40, 120, GROUND_Y - 222));
        L.push(slab('wood', 1150, 1230, 32, 120, GROUND_Y - 222));
        E.push({ x: 1190, y: GROUND_Y - 222 - 120 - 32 - 28 });
        // боковой сарай слева
        L.push(column('wood', 930, 42, 130));
        L.push(column('wood', 1050, 42, 130));
        L.push(slab('ice', 930, 1050, 30, 130));
        E.push({ x: 990, y: GROUND_Y - 28 });
        // правая башня с ящиком СВИНЬ
        L.push(column('ice', 1400, 46, 240));
        L.push(crate('powder', 1400, 90, GROUND_Y - 240));
        L.push(column('stone', 1500, 54, 150));
        return { blocks: L, enemies: E };
      }
    },
    {
      name: '4. Пороховой склад',
      birds: 3,
      hint: 'Поймай момент и подожги склад',
      build: function () {
        var L = [], E = [];
        // склад: два ящика с порохом, между ними коп, общий навес
        L.push(column('wood', 1050, 48, 200));
        L.push(crate('powder', 1150, 110));
        L.push(crate('powder', 1320, 110));
        L.push(column('wood', 1420, 48, 200));
        L.push(slab('stone', 1050, 1420, 40, 200));
        E.push({ x: 1235, y: GROUND_Y - 110 - 28 });
        // второй этаж на навесе
        L.push(column('ice', 1160, 42, 110, GROUND_Y - 240));
        L.push(column('ice', 1310, 42, 110, GROUND_Y - 240));
        L.push(slab('wood', 1160, 1310, 30, 110, GROUND_Y - 240));
        E.push({ x: 1235, y: GROUND_Y - 240 - 110 - 30 - 28 });
        // часовой у дальней стены
        E.push({ x: 1480, y: GROUND_Y - 28 });
        return { blocks: L, enemies: E };
      }
    }
  ];

  /* звёздные пороги считаются в game.js по числу врагов */

  global.LEVELS = LEVELS;
  global.GROUND_Y = GROUND_Y;
  global.buildLevel = function (i) {
    var src = LEVELS[i];
    var built = src.build();
    return {
      name: src.name, birds: src.birds, hint: src.hint,
      blocks: built.blocks, enemies: built.enemies
    };
  };
})(window);
