export function normalizeMarkdown(input: string): string {
    let output = input
        // 1️⃣ 清理多余空格与控制符
        .replace(/\r/g, '')
        .replace(/[ \t]+/g, ' ')
        .replace(/ +\n/g, '\n')
        .trim();

    // 2️⃣ 修复常见错误分隔符与破折号
    output = output
        .replace(/—{2,}/g, '—')
        .replace(/—/g, '-') // 替换为 Markdown 用短横线
        .replace(/- -/g, '-')
        .replace(/[-–—]{3,}/g, '\n\n---\n\n'); // 规范分隔线

    // 3️⃣ 标题规范化
    output = output
        .replace(/(#+)\s*/g, '$1 ')
        .replace(/###\s*\*\*(.*?)\*\*/g, '### $1')
        .replace(/####\s*\*\*(.*?)\*\*/g, '#### $1')
        .replace(/###\s*(.*?)($|\n)/g, '\n\n### $1\n\n')
        .replace(/####\s*(.*?)($|\n)/g, '\n\n#### $1\n\n');

    // 4️⃣ 智能识别时段标题
    output = output.replace(/(\*\*.*?(上午|下午|晚上)：.*?\*\*)/g, '\n\n#### $1\n');

    // 5️⃣ 规范时间节点与无序列表
    output = output
        .replace(/-?\s*\*\*(\d{1,2}:\d{2})\*\*[:：]?\s*/g, '\n- **$1**：')
        .replace(/\n\s*-\s*\*\*/g, '\n- **');

    // 6️⃣ 修复被错误拆断的数字或范围
    output = output
        .replace(/(\d+)\s*-\s*(\d+)/g, '$1-$2')
        .replace(/(\d+)\s*—\s*(\d+)/g, '$1-$2');

    // 7️⃣ 清理空行、保持段落结构
    output = output
        .replace(/\n{3,}/g, '\n\n')
        .replace(/\n{2,}(- \*\*)/g, '\n$1')
        .replace(/(- \*\*.*?\n)\n(- \*\*)/g, '$1$2');

    // 8️⃣ 确保标题间距
    output = output.replace(/(###|####)(.*?)(\S)/g, '$1$2\n\n$3');

    // 9️⃣ 🧹 清理空的无序列表项（重点改进）
    output = output
        .replace(/^-+\s*$/gm, '') // 删除只有破折号的行
        .replace(/^\s*-\s*([·•]*)?\s*$/gm, '') // 删除空的 bullet 列表项
        .replace(/\n{2,}\n/g, '\n\n'); // 重新规整空行

    // 🔟 结尾/开头清理
    output = output.trim();
    if (!output.startsWith('\n')) output = '\n' + output;
    if (!output.endsWith('\n')) output += '\n';

    console.log('Normalized Markdown:', output)

    return output;
}