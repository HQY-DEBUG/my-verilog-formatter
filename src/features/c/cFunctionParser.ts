// 识别 C 函数体及其名称位置；保留源码偏移，不执行预处理或解析 C++ 成员语义。
export interface CFunction {
    name: string;
    offset: number;
    isStatic: boolean;
}

/** 屏蔽注释、字面量和预处理指令，避免伪函数以及宏续行参与匹配。 */
export function maskCSource(text: string): string {
    return text.replace(/\/\*[\s\S]*?(?:\*\/|$)|\/\/[^\r\n]*|"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'/g,
        value => value.replace(/[^\r\n]/g, ' '))
        .replace(/^[\t ]*#(?:[^\r\n]*\\\r?\n)*[^\r\n]*/gm,
            value => value.replace(/[^\r\n]/g, ' '));
}

export function parseCFunctions(text: string): CFunction[] {
    const source = maskCSource(text);
    const tokens = [...source.matchAll(/[A-Za-z_]\w*|[^\s]/g)];
    const result: CFunction[] = [];
    let start = 0;
    let depth = 0;
    const closeParen = (index: number): number => {
        let nested = 0;
        for (let i = index; i < tokens.length; i++) {
            if (tokens[i][0] === '(') { nested++; }
            if (tokens[i][0] === ')' && --nested === 0) { return i; }
        }
        return tokens.length;
    };
    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i][0];
        if (token === '{') { depth++; }
        if (token === '}') { depth--; if (depth === 0) { start = i + 1; } }
        if (depth !== 0) { continue; }
        if (token === ';') { start = i + 1; continue; }
        if (token !== '(') { continue; }
        const name = tokens[i - 1]?.[0];
        const end = closeParen(i);
        const prefix = tokens.slice(start, i - 1).map(item => item[0]);
        let next = end + 1;
        // GCC/MSVC 属性可放在参数表之后；参数表内的函数指针由括号配对处理。
        while (['__attribute__', '__attribute', '__declspec'].includes(tokens[next]?.[0])
            && tokens[next + 1]?.[0] === '(') {
            next = closeParen(next + 1) + 1;
        }
        if (tokens[next]?.[0] === '{' && name && /^[A-Za-z_]\w*$/.test(name)
            && !['if', 'for', 'while', 'switch', 'sizeof', '_Alignof', '__attribute__', '__attribute', '__declspec'].includes(name)
            && prefix.some(part => /^[A-Za-z_]\w*$/.test(part))
            && !prefix.some(part => ['=', 'typedef', ',', '.', '->'].includes(part))) {
            result.push({ name, offset: tokens[i - 1].index!, isStatic: prefix.includes('static') });
        }
        i = end;
    }
    return result;
}
