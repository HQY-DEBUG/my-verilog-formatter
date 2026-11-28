import { alignMatlabArgumentDeclarations } from '../src/features/matlab/matlabArgumentsAlignment';

describe('MATLAB arguments declaration alignment', () => {
    it('aligns validation fields and defaults in the normal_ellipse signature', () => {
        const input = [
            '    arguments',
            '        a (1,1) double {mustBeReal, mustBeFinite} = 3',
            '        b (1,1) double {mustBeReal, mustBeFinite} = 1',
            '        phi0 (1,1) double {mustBeReal, mustBeFinite} = 0.5*pi',
            '        phi (1,1) double {mustBeReal, mustBeFinite} = 2*pi',
            '        x0 (1,1) double {mustBeReal, mustBeFinite} = 1',
            '        y0 (1,1) double {mustBeReal, mustBeFinite} = 1',
            '        alpha (1,1) double {mustBeReal, mustBeFinite} = 0.1*pi',
            '        options.NumPoints (1,1) double {mustBeInteger, mustBePositive} = 50000',
            '        options.Position (1,4) double {mustBeReal, mustBeFinite} = [2561 49 1920 981]',
            '        options.ShowPlot (1,1) logical = true',
            '    end',
        ].join('\n');

        const output = alignMatlabArgumentDeclarations(input);
        const declarations = output.split('\n').slice(1, -1);
        expect(declarations.map(line => line.indexOf('('))).toEqual(Array(10).fill(26));
        expect(declarations.map(line => line.search(/double|logical/))).toEqual(Array(10).fill(32));
        expect(declarations.slice(0, 9).map(line => line.indexOf('{'))).toEqual(Array(9).fill(40));
        expect(declarations.map(line => line.indexOf('='))).toEqual(Array(10).fill(72));
        expect(declarations.map(line => line.slice(74))).toEqual([
            '3', '1', '0.5*pi', '2*pi', '1', '1', '0.1*pi', '50000', '[2561 49 1920 981]', 'true',
        ]);
        expect(alignMatlabArgumentDeclarations(output)).toBe(output);
    });

    it('keeps nested validators, expressions and quoted payloads intact', () => {
        const input = [
            'arguments (Input)',
            `    caption string = 'a''... % ; b' % literal`,
            `    choices (1,:) {mustBeMember(choices, [1, 2; 3, 4])} = build([1,  2], "x""%)") % call`,
            'end',
        ].join('\n');

        const [caption, choices] = alignMatlabArgumentDeclarations(input).split('\n').slice(1, 3);
        expect(caption.indexOf('=')).toBe(choices.indexOf('='));
        expect(caption.lastIndexOf('%')).toBe(choices.lastIndexOf('%'));
        expect(caption).toContain(`= 'a''... % ; b'`);
        expect(choices).toContain(`{mustBeMember(choices, [1, 2; 3, 4])} = build([1,  2], "x""%)")`);
    });

    it('pads trailing comments by display columns', () => {
        expect(alignMatlabArgumentDeclarations([
            'arguments',
            '    a string = "中文" % first',
            '    b string = "abc" % second',
            'end',
        ].join('\n'))).toBe([
            'arguments',
            '    a string = "中文" % first',
            '    b string = "abc"  % second',
            'end',
        ].join('\n'));
    });

    it('does not pad optional fields past the last field of a declaration', () => {
        const input = [
            'arguments (Output)',
            '    x (1,1) double',
            '    result',
            'end',
        ].join('\n');

        expect(alignMatlabArgumentDeclarations(input)).toBe([
            'arguments (Output)',
            '    x      (1,1) double',
            '    result',
            'end',
        ].join('\n'));
    });

    it('restarts groups at section, block and comment boundaries', () => {
        const input = [
            'arguments (Repeating)',
            '    longer (1,1) double',
            '    %% another section',
            '    b (1,1) logical',
            '    % another group',
            '    c (1,1) string',
            'end % repeating',
            'arguments (Output)',
            '    x (1,1) double',
            '    field (1,1) double',
            'end',
            '%{',
            'arguments',
            '    x (1,1) double',
            '    commentedName (1,1) double',
            'end',
            '%}',
            '    a = 1',
            '    untouched = 2',
        ].join('\n');

        expect(alignMatlabArgumentDeclarations(input)).toBe(input.replace('    x (1,1) double\n    field',
            '    x     (1,1) double\n    field'));
    });

    it('skips malformed, ambiguous and multiline declarations in place', () => {
        const input = [
            'arguments',
            '    a (1,1) double = 0',
            '    malformed (n) double = 1',
            '    b (1,1) double = 0',
            '    values (1,:) = ...',
            '    unresolvedName',
            '    c (1,1) double = 0',
            '    data (1,:) double = [1, ...',
            '        2]',
            '    d (1,1) double = 0',
            `    transposed (1,:) double = data'`,
            '    e (1,1) double = 0',
            'end',
        ].join('\n');

        expect(alignMatlabArgumentDeclarations(input)).toBe(input);
    });

    it('still sees a continuation after a transpose and before a comment', () => {
        const input = [
            'arguments',
            `    total double = data' + ... % data's transpose`,
            '    increment',
            '    q double',
            'end',
        ].join('\n');

        expect(alignMatlabArgumentDeclarations(input)).toBe(input);
    });

    it('resets an unterminated validator or default at the block end', () => {
        const input = [
            '    arguments',
            '        incomplete (1,:) = [1, ...',
            '    end; % close malformed block',
            '    arguments (Output, Repeating)',
            '        x double',
            '        count double',
            '    end',
        ].join('\n');

        expect(alignMatlabArgumentDeclarations(input)).toBe(input.replace('        x double', '        x     double'));
    });
});
