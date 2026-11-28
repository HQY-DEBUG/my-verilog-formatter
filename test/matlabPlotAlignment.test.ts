import { alignMatlabPlotCalls } from '../src/features/matlab/matlabPlotAlignment';

describe('MATLAB plot argument alignment', () => {
    it('aligns commas and argument starts in adjacent calls', () => {
        const input = [
            "    plot(x, trace1, 'r'); % first",
            "    plot(time, y, 'b--') % second",
        ].join('\n');
        const expected = [
            "    plot(x   , trace1, 'r'); % first",
            "    plot(time, y     , 'b--') % second",
        ].join('\n');

        expect(alignMatlabPlotCalls(input)).toBe(expected);
        expect(alignMatlabPlotCalls(expected)).toBe(expected);
    });

    it('keeps nested delimiters and quoted commas inside their arguments', () => {
        const input = [
            `plot(f(x, y), [1, 2], 'a'',b');`,
            `plot(x, {a, b, c}, "p"",q");`,
        ].join('\n');

        expect(alignMatlabPlotCalls(input)).toBe([
            `plot(f(x, y), [1, 2]   , 'a'',b');`,
            `plot(x      , {a, b, c}, "p"",q");`,
        ].join('\n'));
    });

    it('uses display columns for arguments containing fullwidth characters', () => {
        expect(alignMatlabPlotCalls([
            'plot(x, "中a", y);',
            'plot(t, "ab", z);',
        ].join('\n'))).toBe([
            'plot(x, "中a", y);',
            'plot(t, "ab" , z);',
        ].join('\n'));
    });

    it.each([
        ['空行', ''],
        ['注释', '% group separator'],
        ['代码节', '%% next section'],
        ['控制语句', 'if condition'],
        ['不同缩进', '    plot(wideX, y);'],
        ['不同参数数量', 'plot(a, b, c);'],
        ['续行', 'plot(a, ...\n    b);'],
        ['转置', "plot(wideX', y);"],
        ['非共轭转置', "plot(wideX.', y);"],
    ])('在%s处结束对齐组', (_description, separator) => {
        const input = ['plot(x, y);', separator, 'plot(time, y);'].join('\n');

        expect(alignMatlabPlotCalls(input)).toBe(input);
    });

    it('preserves calls inside block comments and continued expressions', () => {
        const input = [
            '%{',
            'plot(x, y);',
            'plot(time, y);',
            '%}',
            'trace = ...',
            'plot(x, y);',
            'plot(time, y);',
            'traces = [',
            '    plot(x, y);',
            '    plot(time, y);',
            '];',
        ].join('\n');

        expect(alignMatlabPlotCalls(input)).toBe(input);
    });

    it('does not count delimiters inside command argument strings as open expressions', () => {
        const input = [
            "disp 'Drawing (stage 1';",
            'plot(x, y);',
            'plot(time, y);',
        ].join('\n');

        expect(alignMatlabPlotCalls(input)).toBe([
            "disp 'Drawing (stage 1';",
            'plot(x   , y);',
            'plot(time, y);',
        ].join('\n'));
    });
});
