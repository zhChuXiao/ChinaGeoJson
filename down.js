const fs = require('fs');
const path = require('path');
const https = require('https');
const readline = require('readline');

// 基础配置
// 这是地图的下载地址
const baseUrl = 'https://geo.datav.aliyun.com/areas_v3/bound/';
// 这是所有地区编码
const infoUrl = 'https://geo.datav.aliyun.com/areas_v3/bound/infos.json';
// 控制直辖市下级区是否放在 citys 文件夹下（便于地图下钻的逻辑处理）
const MUNICIPALITIES = ['110000', '120000', '310000', '500000']; // 北京、天津、上海、重庆
let municipalityChildrenInCitys; // 控制直辖市下级区是否放在 citys 文件夹下
// // 这是输出目录
// const outputDir = './';

// // 添加命名方式配置
// const config = {
//     nameFormat: 'adcode', // 可选值: 'adcode', 'chinese'
// };

// 命令行交互
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

// ANSI 颜色代码 终端进度条用
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    bgBlue: '\x1b[44m',
};

// 进度条类
class ProgressBar {
    constructor(name, total, width = 30) {
        this.name = name;
        this.total = total;
        this.current = 0;
        this.width = width;
    }

    update(current, currentItem = '') {
        this.current = current;
        const percentage = Math.round((this.current / this.total) * 100);
        const filledWidth = Math.round(this.width * (this.current / this.total));
        const emptyWidth = this.width - filledWidth;

        const filled = '█'.repeat(filledWidth);
        const empty = '░'.repeat(emptyWidth);
        const bar = `${filled}${empty}`;

        process.stdout.clearLine(0);
        process.stdout.cursorTo(0);
        process.stdout.write(
            `${colors.magenta}♦${colors.reset} ${colors.bright}${this.name}${colors.reset} ` +
            `${colors.cyan}${bar}${colors.reset} ${colors.yellow}${percentage}%${colors.reset} ` +
            `(${this.current}/${this.total}) ${colors.dim}${currentItem}${colors.reset}`
        );
    }

    complete() {
        process.stdout.write('\n');
    }
}

// 创建目录
const createDir = (dir) => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
};

// 修改 HTTPS 请求函数，添加重试机制
const httpsGet = async (url, retries = 3) => {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await new Promise((resolve, reject) => {
                https.get(url, (res) => {
                    if (res.statusCode !== 200) {
                        reject(new Error(`HTTP 状态码: ${res.statusCode}`));
                        return;
                    }

                    let data = '';
                    res.on('data', (chunk) => data += chunk);
                    res.on('end', () => resolve(data));
                }).on('error', reject);
            });

            try {
                return JSON.parse(response);
            } catch (parseError) {
                // 如果是最后一次重试，则抛出错误
                if (i === retries - 1) {
                    throw new Error(`JSON 解析失败: ${parseError.message}`);
                }
                // 否则继续重试
                await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1))); // 递增延迟
                continue;
            }
        } catch (error) {
            // 如果是最后一次重试，则抛出错误
            if (i === retries - 1) {
                throw error;
            }
            // 否则继续重试
            await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1))); // 递增延迟
            continue;
        }
    }
};

// 修改 getFileName 函数，添加对全国地图的特殊处理
const getFileName = (code, info, type = '', nameFormat) => {
    // 如果是全国地图（代码为100000），则返回 china.json
    if (code === '100000') {
        return 'china.json';
    }
    
    switch (nameFormat) {
        case 'chinese':
            return `${info.name}${type}.json`;
        case 'adcode':
        default:
            return `${code}.json`;
    }
};

// 修改 downloadJson 函数，添加 useFullVersion 参数
const downloadJson = async (url, outputPath, info, progressBar = null, currentItem = '', useFullVersion = false) => {
    try {
        // 如果需要下载 full 版本，先尝试下载
        if (useFullVersion) {
            try {
                const fullUrl = url.replace('.json', '_full.json');
                const data = await httpsGet(fullUrl);
                fs.writeFileSync(outputPath, JSON.stringify(data));
                if (progressBar) {
                    progressBar.update(progressBar.current + 1, currentItem);
                } else {
                    console.log(`${colors.green}✓${colors.reset} 成功下载: ${colors.cyan}${outputPath}${colors.reset}`);
                }
                return;
            } catch (error) {
                console.log(`${colors.yellow}!${colors.reset} full 版本下载失败，尝试基础版本...`);
            }
        }

        // 下载基础版本
        const data = await httpsGet(url);
        fs.writeFileSync(outputPath, JSON.stringify(data));
        if (progressBar) {
            progressBar.update(progressBar.current + 1, currentItem);
        } else {
            console.log(`${colors.green}✓${colors.reset} 成功下载: ${colors.cyan}${outputPath}${colors.reset}`);
        }
        await new Promise(resolve => setTimeout(resolve, 200));
    } catch (error) {
        console.error(`${colors.red}✗${colors.reset} 下载失败: ${colors.cyan}${url}${colors.reset}`, error.message);
        if (progressBar) {
            progressBar.update(progressBar.current + 1, `${colors.red}${currentItem} (失败)${colors.reset}`);
        }
    }
};

// 主函数
const main = async () => {
    try {
        console.log('\n' + colors.bright + colors.bgBlue + ' 中国地图数据下载工具 ' + colors.reset + '\n');

        // 获取用户输入的输出目录
        const outputDir = await question(`${colors.yellow}请输入输出目录路径 (直接回车默认为当前目录)：${colors.reset}`);
        const finalOutputDir = outputDir || './';

        // 获取用户选择的命名方式
        const nameFormatAnswer = await question(`${colors.yellow}请选择文件命名方式 (1: 行政代码, 2: 中文名称) [默认: 1]：${colors.reset}`);
        const nameFormat = nameFormatAnswer === '2' ? 'chinese' : 'adcode';

        // 获取省级地图数据粒度
        const provinceLevelAnswer = await question(`${colors.yellow}请选择省级地图数据粒度 (1: 包含市级边界, 2: 包含区县级边界, 3: 不包含下级边界) [默认: 1]：${colors.reset}`);
        const provinceLevel = provinceLevelAnswer === '2' ? 2 : (provinceLevelAnswer === '3' ? 3 : 1);

        // 获取市级地图数据粒度
        const cityLevelAnswer = await question(`${colors.yellow}请选择市级地图数据粒度 (1: 包含区县级边界, 2: 不包含下级边界) [默认: 1]：${colors.reset}`);
        const cityLevel = cityLevelAnswer === '2' ? 2 : 1;

        // 添加直辖市下级区存放位置的选择
        const municipalityAnswer = await question(`${colors.yellow}是否将直辖市下级区地图放在citys文件夹下（便于地图下钻的逻辑处理）(y/n) [默认: y]：${colors.reset}`);
        municipalityChildrenInCitys = municipalityAnswer.toLowerCase() !== 'n';

        // 创建输出目录
        createDir(finalOutputDir);
        createDir(path.join(finalOutputDir, 'province'));
        createDir(path.join(finalOutputDir, 'citys'));
        createDir(path.join(finalOutputDir, 'county'));

        // 获取地区信息
        console.log(`${colors.blue}ℹ${colors.reset} 正在获取地区信息...`);
        const areaInfos = await httpsGet(infoUrl);
        if (!areaInfos) return;

        // 保存压缩版的 info.json
        fs.writeFileSync(path.join(finalOutputDir, 'info.json'), JSON.stringify(areaInfos));
        console.log(`${colors.green}✓${colors.reset} 地区信息已保存至 info.json`);

        // 计算总任务数
        let totalFiles = 1; // 全国地图
        let provinceCount = 0;
        for (const [adcode, info] of Object.entries(areaInfos)) {
            if (adcode.endsWith('0000') && adcode !== '100000') {
                provinceCount++;
                const provinceCode = adcode;
                const cities = Object.entries(areaInfos).filter(([code]) => 
                    code.startsWith(provinceCode.slice(0, 2)) && 
                    code.endsWith('00') && 
                    code !== provinceCode
                );
                totalFiles++; // 省级地图
                totalFiles += cities.length; // 市级地图

                for (const [cityCode] of cities) {
                    const counties = Object.entries(areaInfos).filter(([code]) => 
                        code.startsWith(cityCode.slice(0, 4)) && 
                        !code.endsWith('00')
                    );
                    totalFiles += counties.length; // 县级地图
                }
            }
        }

        console.log(`${colors.blue}ℹ${colors.reset} 总计需要下载 ${colors.yellow}${totalFiles}${colors.reset} 个地图文件`);
        console.log(`${colors.blue}ℹ${colors.reset} 共有 ${colors.yellow}${provinceCount}${colors.reset} 个省级行政区\n`);

        // 下载全国地图
        const chinaInfo = areaInfos['100000'];
        await downloadJson(
            `${baseUrl}100000.json`,
            path.join(finalOutputDir, getFileName('100000', chinaInfo, '', nameFormat)),
            chinaInfo
        );
        console.log(`${colors.blue}→${colors.reset} 全国地图下载完成\n`);

        // 处理省级数据
        for (const [adcode, info] of Object.entries(areaInfos)) {
            if (adcode.endsWith('0000') && adcode !== '100000') {
                const provinceCode = adcode;
                
                // 获取所有下级行政区
                const cities = Object.entries(areaInfos).filter(([code]) => 
                    code.startsWith(provinceCode.slice(0, 2)) && 
                    code.endsWith('00') && 
                    code !== provinceCode
                );

                const counties = Object.entries(areaInfos).filter(([code]) => 
                    code.startsWith(provinceCode.slice(0, 2)) && 
                    !code.endsWith('00')
                );

                // 计算该省的总任务数
                let provinceTotalTasks = 1; // 省级地图

                // 添加市级地图任务数
                if (provinceLevel !== 3) {
                    provinceTotalTasks += cities.length;
                }

                // 添加区县级地图任务数（如果需要）
                if (provinceLevel === 2 || (provinceLevel !== 3 && cityLevel === 1)) {
                    provinceTotalTasks += counties.length;
                }

                console.log(`${colors.blue}→${colors.reset} 开始处理: ${colors.bright}${info.name}${colors.reset}`);
                console.log(`${colors.blue}ℹ${colors.reset} 需要下载 ${colors.yellow}${provinceTotalTasks}${colors.reset} 个地图文件`);

                const progressBar = new ProgressBar(info.name, provinceTotalTasks);

                // 下载省级地图（根据选择的粒度决定是否使用 full 版本）
                await downloadJson(
                    `${baseUrl}${provinceCode}.json`,
                    path.join(finalOutputDir, 'province', getFileName(provinceCode, info, '', nameFormat)),
                    info,
                    progressBar,
                    '省级地图',
                    provinceLevel !== 3  // 如果不是跳过下级边界，则尝试下载 full 版本
                );

                // 如果不是跳过下级边界
                if (provinceLevel !== 3) {
                    // 下载市级地图
                    for (const [cityCode, cityInfo] of cities) {
                        await downloadJson(
                            `${baseUrl}${cityCode}.json`,
                            path.join(finalOutputDir, 'citys', getFileName(cityCode, cityInfo, '', nameFormat)),
                            cityInfo,
                            progressBar,
                            `市级: ${cityInfo.name}`,
                            cityLevel === 1  // 如果选择包含区县级边界，则尝试下载 full 版本
                        );
                    }

                    // 下载区县级地图（如果需要）
                    if (provinceLevel === 2 || cityLevel === 1) {
                        for (const [countyCode, countyInfo] of counties) {
                            // 确定目标目录
                            const isMunicipality = MUNICIPALITIES.includes(provinceCode);
                            const targetDir = (isMunicipality && municipalityChildrenInCitys) ? 'citys' : 'county';
                            
                            await downloadJson(
                                `${baseUrl}${countyCode}.json`,
                                path.join(finalOutputDir, targetDir, getFileName(countyCode, countyInfo, '', nameFormat)),
                                countyInfo,
                                progressBar,
                                `区县: ${countyInfo.name}`
                            );
                        }
                    }
                }

                progressBar.complete();
                console.log(`${colors.green}✓${colors.reset} ${colors.bright}${info.name}${colors.reset} 处理完成！\n`);
            }
        }

        console.log(`${colors.green}✨${colors.reset} ${colors.bright}所有地图数据下载完成！${colors.reset}\n`);
    } catch (error) {
        console.error(`${colors.red}错误:${colors.reset}`, error.message);
    } finally {
        rl.close();
    }
};

// 添加错误处理
process.on('unhandledRejection', (error) => {
    console.error(`${colors.red}✗${colors.reset} 未处理的 Promise 拒绝:`, error);
    process.exit(1);
});

main();