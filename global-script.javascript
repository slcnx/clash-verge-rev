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
    `DOMAIN-SUFFIX,ip.look,${finalTarget}`
  ];

  if (!config.rules) config.rules = [];
  
  // 将自定义规则插到系统原有规则的最前面
  config.rules = myExtraRules.concat(config.rules);

  return config;
}
