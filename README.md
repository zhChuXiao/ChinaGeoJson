# ChinaGeoJson
## DataV.GeoAtlas最新全国各省市区县地图JSON数据(附node批量下载脚本)
> 阿里云的DataV.GeoAtlas官网地图数据是无法批量下载的，只能一个一个的下载，最近在做地图下钻的功能，需要大量地区的json数据，挨个下载又觉得很麻烦，所以做了个简易node脚本用来批量下载。

### 数据来源
- 阿里云[DataV.GeoAtlas](https://datav.aliyun.com/portal/school/atlas/area_selector)

### 目录结构
- info.json: 包含所有地区的层级信息以及经纬度信息
- china.json: 全国地图json数据
- province: 省地图json数据
- city: 市地图json数据
- county: 县地图json数据

### 下载脚本
- down.js: 下载脚本

### 使用方法

> 不需要安装任何依赖，直接运行即可
```bash
node down.js
```
> 下载完成后，当前目录下会生成china.json文件以及province、city、county目录，里面包含各个级别的地图json数据，以及info.json文件，里面包含所有地区的层级信息（地区编码、父级编码）以及地理边界数据（如经纬度坐标，方便用于echarts散点图的位置显示）

### 备注
- 下载脚本会自动下载V3版本最新数据，如果需要下载V2版本数据，请修改down.js中的`baseUrl`和`infoUrl`
- 默认下载目录为当前目录，如果需要下载到其他目录，请修改down.js中的`outputDir`, 例如：`const outputDir = './data';`(已改为命令行交互的方式选择目录)
- 默认下载的json文件昵称是以adcode命名，也就是各地区的行政区划代码，如果需要下载以省市名称命名的json文件，请修改down.js中的`nameFormat`为`chinese`(已改为命令行交互的方式选择命名方式)
- 可以自行选择省级、区县级地图数据粒度，默认省级地图只包含市级边界，市级地图包含区县级边界，可以根据控制台交互的引导进行更改。
- 为方便做地图省市级下钻的逻辑处理，直辖市下区级地图默认会放在citys文件夹，可以根据控制台交互的引导进行更改。
![image](./download.png)
