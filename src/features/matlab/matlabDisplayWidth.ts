const FULLWIDTH_CHARACTER = /[\u2e80-\ud7af\uf900-\ufaff\uff01-\uff5e\uffe0-\uffe6]/u;

export function matlabDisplayWidth(text: string): number {
    let width = 0;
    for (const character of text) {
        width += FULLWIDTH_CHARACTER.test(character) ? 2 : 1;
    }
    return width;
}
