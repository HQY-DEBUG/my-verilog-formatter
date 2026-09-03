import { formatMatlab } from '../src/features/matlab/matlabFormatter';

describe('MATLAB formatter', () => {
    it('使用四空格缩进并对齐连续赋值和行尾注释', () => {
        const input = [
            'function run()',
            'dataDir = \'CollData\'; % 数据文件夹路径',
            'resultDir = \'result\\\'; % 结果文件夹路径',
            'fileFormat = \'*.txt\'; % 文件匹配格式',
            'if true',
            'value=1; % 条件值',
            'longValue = 20; % 长条件值',
            'end',
            'end',
        ].join('\n');

        expect(formatMatlab(input)).toBe([
            'function run()',
            '    dataDir    = \'CollData\'; % 数据文件夹路径',
            '    resultDir  = \'result\\\' ; % 结果文件夹路径',
            '    fileFormat = \'*.txt\'   ; % 文件匹配格式',
            '    if true',
            '        value     = 1 ; % 条件值',
            '        longValue = 20; % 长条件值',
            '    end',
            'end',
        ].join('\n'));
    });

    it('分支关键字与结束关键字应和所属块对齐', () => {
        const input = [
            'if ready',
            'run();',
            'else',
            'recover();',
            'end',
            'switch mode',
            'case 1',
            'run();',
            'otherwise',
            'recover();',
            'end',
        ].join('\n');

        expect(formatMatlab(input)).toBe([
            'if ready',
            '    run();',
            'else',
            '    recover();',
            'end',
            'switch mode',
            '    case 1',
            '        run();',
            '    otherwise',
            '        recover();',
            'end',
        ].join('\n'));
    });

    it('代码功能配置单元内的小标题和空行不应断开对齐范围', () => {
        const input = [
            '%% 代码功能配置',
            '% 搜索文件夹以及顺序配置',
            'dataDir = \'CollData\'; % 数据文件夹路径',
            'resultDir = \'result\\\'; % 结果文件夹路径',
            'fileNumber = 2:6; % 指定读取的文件序号',
            '% 原始数据绘图配置',
            'ORIGIN_PLOT = 1; % 是否绘制原始曲线',
            '',
            '% XY 轴数据绘图配置',
            'XY_AXIS_PLOT = 1; % 是否分轴绘图',
            '',
            '% 数据匹配绘图配置',
            'AD_DATA_START_NUM = 20; % AD数据开始丢弃数据量',
            '',
            '%% 查找数据文件',
            'res_files = findFile(dataDir, fileFormat);',
        ].join('\n');

        const formatted = formatMatlab(input);
        const [configuration] = formatted.split('%% 查找数据文件');
        const assignments = configuration.split('\n').filter(line => line.includes('='));
        expect(new Set(assignments.map(line => line.indexOf('='))).size).toBe(1);
        expect(new Set(assignments.map(line => line.indexOf(';'))).size).toBe(1);
        expect(new Set(assignments.map(line => line.indexOf('%'))).size).toBe(1);
        expect(formatted).toContain('res_files = findFile(dataDir, fileFormat);');
    });

    it('函数调用赋值语句只缩进，不参与配置变量对齐', () => {
        const input = [
            'if WEIGHTED_XY_PLOT',
            'fig_weighted_xy = figure("Name", "加权图");',
            'ax_weighted_xy = axes(fig_weighted_xy);',
            'hold(ax_weighted_xy, "on");',
            'end',
        ].join('\n');

        expect(formatMatlab(input)).toBe([
            'if WEIGHTED_XY_PLOT',
            '    fig_weighted_xy = figure("Name", "加权图");',
            '    ax_weighted_xy = axes(fig_weighted_xy);',
            '    hold(ax_weighted_xy, "on");',
            'end',
        ].join('\n'));
    });

    it('计算赋值语句只缩进，不参与配置变量对齐', () => {
        const input = [
            'if WEIGHTED_XY_PLOT',
            'time = 1:10;',
            'sampleCount = totalCount / 10;',
            'end',
        ].join('\n');

        expect(formatMatlab(input)).toBe([
            'if WEIGHTED_XY_PLOT',
            '    time = 1:10;',
            '    sampleCount = totalCount / 10;',
            'end',
        ].join('\n'));
    });

    it('新节内单个配置变量不继承上一节的补齐空格', () => {
        const input = [
            'dataDir = \'CollData\'; % 数据文件夹路径',
            'fileNumber = 1; % 文件序号',
            '',
            '%% 加权后 XY 数据绘图配置',
            'WEIGHTED_XY_PLOT        = 1;                         % 是否绘制加权后 XY 数据',
        ].join('\n');

        expect(formatMatlab(input)).toContain(
            'WEIGHTED_XY_PLOT = 1; % 是否绘制加权后 XY 数据',
        );
    });

    it('执行赋值语句应清理旧对齐留下的空格', () => {
        const input = [
            'if WEIGHTED_XY_PLOT',
            'fig_weighted_xy        = figure("Name", "加权图");',
            'ax_xy                   = axes(fig_weighted_xy);',
            'time                    = (1:length(weight_cmd_x)) * 10          ;',
            'end',
        ].join('\n');

        expect(formatMatlab(input)).toBe([
            'if WEIGHTED_XY_PLOT',
            '    fig_weighted_xy = figure("Name", "加权图");',
            '    ax_xy = axes(fig_weighted_xy);',
            '    time = (1:length(weight_cmd_x)) * 10;',
            'end',
        ].join('\n'));
    });

});
