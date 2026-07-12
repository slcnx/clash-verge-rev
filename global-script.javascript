// =========================================================
// 1. 在这里“无脑粘贴”你的原始节点列表
// 格式保持原样： - { name: 'xxx', server: xxx ... }
// =========================================================
const RAW_NODES = `

`;



function main(config) {
  // =========================================
  // 1. 端口与节点配置区 (未来加端口，只改这里即可)
  // =========================================
  const portConfigs = [
    {
      listenerName: "jp-mixed-port",
      port: 7892,
      groupName: "7892端口-日本专属组",
      filter: "(?i)日|jp|japan|tokyo"
    },
    {
      listenerName: "us-mixed-port",
      port: 7893,
      groupName: "7893端口-美国专属组",
      filter: "(?i)美|us|usa|america|los angeles"
    }
    // 如果以后想加香港，直接在这里补充一行即可，无需复制一大堆代码
    // { listenerName: "hk-mixed-port", port: 7894, groupName: "香港专属", filter: "(?i)港|hk" }
  ];


  // 初始化必要的数组
  if (!config['proxy-groups']) config['proxy-groups'] = [];
  if (!config.listeners) config.listeners = [];


  // =========================================
  // 2. 批量生成 策略组 和 Listener 监听端口
  // =========================================
  portConfigs.forEach(item => {
    // 2.1 注入专属策略组 (带有基础的去重保护)
    config['proxy-groups'] = config['proxy-groups'].filter(g => g.name !== item.groupName);
    config['proxy-groups'].push({
      name: item.groupName,
      type: "url-test",
      url: "http://www.gstatic.com/generate_204",
      interval: 300,
      "include-all": true,
      filter: item.filter,
      // 💡 优化项：强烈建议加上 exclude-filter，防止误抓取倍率提示或到期提示节点
      "exclude-filter": "(?i)剩余|到期|过期|官网|测试|流量|x[2-9]|倍率" 
    });

    // 2.2 注入监听端口 (修复了原脚本漏掉美国端口去重的 Bug)
    config.listeners = config.listeners.filter(l => l.name !== item.listenerName);
    config.listeners.push({
      name: item.listenerName,
      type: "mixed",
      port: item.port,
      proxy: item.groupName // 绑定上面刚创建的专属组
    });
  });


// =========================================
  // 3. 配置自定义额外路由规则 (加入安全防报错机制)
  // =========================================
  
  // 3.1 定义你最想用的目标策略组名称
  const idealTarget = "♻️ 自动选择";
  
  // 3.2 检查当前订阅的 proxy-groups 里是否存在这个名称
  let finalTarget = "DIRECT"; // 默认安全降级方案：直连 (或者改为 "GLOBAL")
  
  if (config['proxy-groups'] && config['proxy-groups'].some(g => g.name === idealTarget)) {
    // 如果找到了，就用你的理想目标
    finalTarget = idealTarget; 
  } else if (config['proxy-groups'] && config['proxy-groups'].some(g => g.name === "Proxy")) {
    // (可选) 备用选项：如果没有自动选择，但有 Proxy，就用 Proxy
    finalTarget = "Proxy";
  } else if (config['proxy-groups'] && config['proxy-groups'].length > 0) {
    // (可选) 终极备用：如果连 Proxy 都没有，就随便抓取当前机场的第一个策略组
    finalTarget = config['proxy-groups'][0].name; 
  }

  // 3.3 注入规则时，使用动态计算出来的 finalTarget
  const myExtraRules = [
    `DOMAIN-SUFFIX,ip.look,${finalTarget}`,
    `DOMAIN-SUFFIX,getwhisky.app,${finalTarget}`,
    `DOMAIN-SUFFIX,trancy.org,${finalTarget}`,
    `DOMAIN-SUFFIX,gstatic.com,💡 Gemini + Google`
  ];

  if (!config.rules) config.rules = [];
  
  // 将自定义规则插到系统原有规则的最前面
  config.rules = myExtraRules.concat(config.rules);


 // 没有 Sniffer 时：ProxyBridge 传过来 IP，Clash 只能匹配到“IP 规则”。如果该 IP 不在规则列表里，或者触发了错误的 GeoIP 规则，连接就会挂掉（i/o timeout）。
 // 有 Sniffer 时：
    // 流量敲门：ProxyBridge 说：“这是 IP 216.239.34.223 的数据。”
    // 嗅探介入：Clash：“等等，我拆开看看。”（嗅探器瞬间捕获 gemini.google.com）。
    // 强制更正：Clash：“原来是 Gemini！force-domain 规定必须听域名的，立即重新查找规则。”
    // 精准分流：Clash：“找到了，域名命中 DomainKeyword(google)，走美国代理节点。”
    // 完美登录：连接瞬间变绿。

  config.sniffer = {
    enable: true,           // 1. 全局开关
    "force-domain": ["+"],  // 2. 强制覆盖策略
    sniff: {                // 3. 嗅探协议配置
      TLS: {
        ports: [443, 8443]  // 针对 HTTPS 的嗅探
      },
      HTTP: {
        ports: [80]         // 针对 HTTP 的嗅探
      }
    }
  };

 

  // =========================================================
  // 2. 自定义微型 YAML 单行解析器 (专门解析带大括号和横线的文本)
  // =========================================================
  function parseClashScanner(rawStr) {
    const nodes = [];
    const lines = rawStr.split('\n');
    
    function parseDict(str) {
      let obj = {};
      let i = 0;
      while (i < str.length) {
        // 跳过前导空白符
        while (str[i] === ' ' || str[i] === '\n' || str[i] === '\r') i++;
        if (i >= str.length) break;
        
        // 提取键名 (直到遇到第一个冒号)
        let colonIdx = str.indexOf(':', i);
        if (colonIdx === -1) break;
        let currentKey = str.substring(i, colonIdx).trim();
        i = colonIdx + 1;
        
        // 提取键值
        while (str[i] === ' ' || str[i] === '\n' || str[i] === '\r') i++;
        let valStart = i;
        let inQuote = false;
        let quoteChar = '';
        let braceCount = 0;
        
        // 状态机游标寻找值的边界（逗号或者结尾）
        while (i < str.length) {
          let char = str[i];
          if (char === "'" || char === '"') {
            if (!inQuote) { inQuote = true; quoteChar = char; }
            else if (quoteChar === char) { inQuote = false; }
          } else if (!inQuote) {
            if (char === '{') braceCount++;
            else if (char === '}') braceCount--;
            else if (char === ',' && braceCount === 0) break; // 找到同层级的逗号
          }
          i++;
        }
        
        let valStr = str.substring(valStart, i).trim();
        
        // 类型分发转换
        if (valStr.startsWith('{') && valStr.endsWith('}')) {
          // 递归解析嵌套对象 (如 reality-opts: { ... })
          obj[currentKey] = parseDict(valStr.substring(1, valStr.length - 1));
        } else {
          // 剥离单双引号
          if ((valStr.startsWith("'") && valStr.endsWith("'")) || 
              (valStr.startsWith('"') && valStr.endsWith('"'))) {
            valStr = valStr.substring(1, valStr.length - 1);
          }
          // 类型判定
          if (valStr === 'true') obj[currentKey] = true;
          else if (valStr === 'false') obj[currentKey] = false;
          else if (/^\d+$/.test(valStr)) obj[currentKey] = Number(valStr); // 纯数字
          else obj[currentKey] = valStr; // 保留为字符串 (IP, 域名, UUID)
        }
        i++; // 跳过刚才找到的逗号
      }
      return obj;
    }

    // 逐行切分文本，去掉 "- {"
    for (let line of lines) {
      line = line.trim();
      if (!line.startsWith('- {') || !line.endsWith('}')) continue;
      // 提取 {} 内部的核心字典内容交由扫描器处理
      let content = line.substring(3, line.length - 1).trim();
      nodes.push(parseDict(content));
    }
    
    return nodes;
  }

  // =========================================================
  // 3. 执行解析并追加
  // =========================================================
  const newNodes = parseClashScanner(RAW_NODES);
  console.log(newNodes,'--------->')
  if (newNodes.length === 0) return config;
// 💥 【核心修改点 1】在这里直接修改节点实体本身的名字！
  newNodes.forEach(node => {
    node.name = `New-${node.name}`; 
  });

  // 将改好名字的节点实体注入到全局 proxies 列表
  config.proxies = config.proxies || [];
  config.proxies.push(...newNodes);

  // 提取解析出的节点名字（因为上面实体名字已经改了，这里照常提取即可）
  const newNodeNames = newNodes.map(n => n.name);

  // 💥 【核心修改点 2】设置你要追加的代理组名字
  const targetGroups = ["🔰 节点选择",'🐟 漏网之鱼'];

  if (config["proxy-groups"]) {
    config["proxy-groups"].forEach(group => {
      // 如果当前策略组的名字包含在我们想要注入的目标列表里
      if (targetGroups.includes(group.name)) {
        group.proxies = group.proxies || [];
        // 直接把名字怼进去
        group.proxies.push(...newNodeNames);
      }
    });
  }

  return config;
}
