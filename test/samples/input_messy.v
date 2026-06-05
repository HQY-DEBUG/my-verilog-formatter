/**************************************************************************/
// Function   : 格式化测试样例：输入（格式混乱）
// Version    : v1.0
// Date       : 2026/05/25
//
// Modify:
// version       date       modify
// --------    -----------  ------------------------------------------------
//  v1.0        2026/05/25  创建文件
/**************************************************************************/

module test_input #(
parameter DATA_WIDTH = 16,
parameter ADDR_WIDTH = 8
)(
input wire clk, // 时钟
input wire rstn, // 复位
input wire [DATA_WIDTH-1:0] din, // 数据输入
output reg [DATA_WIDTH-1:0] dout, // 数据输出
output wire valid // 数据有效
);

// 信号定义（未对齐）
reg [3:0] cnt;     // 计数器
reg flag;  // 标志位
wire [7:0] data;  // 数据总线
wire valid_i; // 内部有效

// 时序逻辑（begin 未另起一行）
always @(posedge clk or negedge rstn) begin
    if (rstn == 0) begin
        cnt <= 0;
        flag <= 0;
    end else begin
        cnt <= cnt + 1;
        if (cnt == 4'hF) begin
            flag <= 1;
        end
    end
end

// 组合逻辑 case（无 default）
always @(*) begin
    case (cnt)
        4'd0: dout = 16'h0000;
        4'd1: dout = 16'hFFFF;
    endcase
end

endmodule
