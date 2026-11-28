"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.matlabDisplayWidth = matlabDisplayWidth;
const FULLWIDTH_CHARACTER = /[\u2e80-\ud7af\uf900-\ufaff\uff01-\uff5e\uffe0-\uffe6]/u;
function matlabDisplayWidth(text) {
    let width = 0;
    for (const character of text) {
        width += FULLWIDTH_CHARACTER.test(character) ? 2 : 1;
    }
    return width;
}
//# sourceMappingURL=matlabDisplayWidth.js.map