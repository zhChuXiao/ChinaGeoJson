const fs = require('fs');
const path = require('path');
const https = require('https');

// 基础配置
// 这是地图的下载地址
const baseUrl = 'https://geo.datav.aliyun.com/areas_v3/bound/';
// 这是所有地区编码
const infoUrl = 'https://geo.datav.aliyun.com/areas_v3/bound/infos.json';
// 这是输出目录
const outputDir = './';

// 添加命名方式配置
const config = {
    nameFormat: 'adcode', // 可选值: 'adcode', 'chinese'
};

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

// HTTPS 请求 
const httpsGet = (url) => {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const jsonData = JSON.parse(data);
                    resolve(jsonData);
                } catch (error) {
                    reject(new Error(`JSON 解析失败: ${error.message}`));
                }
            });
        }).on('error', (error) => {
            reject(new Error(`请求失败: ${error.message}`));
        });
    });
};

// 修改 getFileName 函数，添加对全国地图的特殊处理
const getFileName = (code, info, type = '') => {
    // 如果是全国地图（代码为100000），则返回 china.json
    if (code === '100000') {
        return 'china.json';
    }
    
    switch (config.nameFormat) {
        case 'chinese':
            return `${info.name}${type}.json`;
        case 'adcode':
        default:
            return `${code}.json`;
    }
};

// 修改 downloadJson 函数
const downloadJson = async (url, outputPath, info, progressBar = null, currentItem = '') => {
    try {
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
    }
};

// 获取地区信息
const getAreaInfos = async () => {
    try {
        console.log(`${colors.blue}ℹ${colors.reset} 正在获取地区信息...`);
        const data = await httpsGet(infoUrl);
        
        // 保存压缩版的 info.json
        fs.writeFileSync(path.join(outputDir, 'info.json'), JSON.stringify(data));
        console.log(`${colors.green}✓${colors.reset} 地区信息已保存至 info.json`);
        
        return data;
    } catch (error) {
        console.error(`${colors.red}✗${colors.reset} 获取地区信息失败:`, error.message);
        return null;
    }
};

// 主函数
const main = async () => {
    console.log('\n' + colors.bright + colors.bgBlue + ' 中国地图数据下载工具 ' + colors.reset + '\n');

    // 创建输出目录
    createDir(path.join(outputDir, 'province'));
    createDir(path.join(outputDir, 'citys'));
    createDir(path.join(outputDir, 'county'));

    // 获取地区信息
    const areaInfos = await getAreaInfos();
    if (!areaInfos) return;

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
        path.join(outputDir, getFileName('100000', chinaInfo)),
        chinaInfo
    );
    console.log(`${colors.blue}→${colors.reset} 全国地图下载完成\n`);

    // 处理省级数据
    for (const [adcode, info] of Object.entries(areaInfos)) {
        if (adcode.endsWith('0000') && adcode !== '100000') {
            const provinceCode = adcode;
            
            // 计算该省的总任务数
            const cities = Object.entries(areaInfos).filter(([code]) => 
                code.startsWith(provinceCode.slice(0, 2)) && 
                code.endsWith('00') && 
                code !== provinceCode
            );

            let provinceTotalTasks = 1;
            provinceTotalTasks += cities.length;

            for (const [cityCode] of cities) {
                const counties = Object.entries(areaInfos).filter(([code]) => 
                    code.startsWith(cityCode.slice(0, 4)) && 
                    !code.endsWith('00')
                );
                provinceTotalTasks += counties.length;
            }

            console.log(`${colors.blue}→${colors.reset} 开始处理: ${colors.bright}${info.name}${colors.reset}`);
            console.log(`${colors.blue}ℹ${colors.reset} 需要下载 ${colors.yellow}${provinceTotalTasks}${colors.reset} 个地图文件`);

            // 创建省份进度条
            const progressBar = new ProgressBar(info.name, provinceTotalTasks);

            // 下载省级地图
            await downloadJson(
                `${baseUrl}${provinceCode}.json`,
                path.join(outputDir, 'province', getFileName(provinceCode, info)),
                info,
                progressBar,
                '省级地图'
            );

            // 下载市级地图
            for (const [cityCode, cityInfo] of cities) {
                await downloadJson(
                    `${baseUrl}${cityCode}.json`,
                    path.join(outputDir, 'citys', getFileName(cityCode, cityInfo)),
                    cityInfo,
                    progressBar,
                    `市级: ${cityInfo.name}`
                );

                // 获取该市的所有县/区
                const counties = Object.entries(areaInfos).filter(([code, countyInfo]) => 
                    code.startsWith(cityCode.slice(0, 4)) && 
                    !code.endsWith('00')
                );

                // 下载县级地图
                for (const [countyCode, countyInfo] of counties) {
                    await downloadJson(
                        `${baseUrl}${countyCode}.json`,
                        path.join(outputDir, 'county', getFileName(countyCode, countyInfo)),
                        countyInfo,
                        progressBar,
                        `县区: ${countyInfo.name}`
                    );
                }
            }

            progressBar.complete();
            console.log(`${colors.green}✓${colors.reset} ${colors.bright}${info.name}${colors.reset} 处理完成！\n`);
        }
    }

    console.log(`${colors.green}✨${colors.reset} ${colors.bright}所有地图数据下载完成！${colors.reset}\n`);
};

// 添加错误处理
process.on('unhandledRejection', (error) => {
    console.error(`${colors.red}✗${colors.reset} 未处理的 Promise 拒绝:`, error);
    process.exit(1);
});

main();