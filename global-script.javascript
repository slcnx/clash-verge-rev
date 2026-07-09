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
  // 3. 配置自定义额外路由规则
  // =========================================
  const myExtraRules = [
    // ⚠️ 注意：这里的 "♻️ 自动选择" 必须是你当前机场订阅里确实存在的一个策略组名字
    // 如果原配置里没有这个 emoji 或者名字有一字之差，内核会报错
    "DOMAIN-SUFFIX,ip.look,♻️ 自动选择"
  ];

  if (!config.rules) config.rules = [];
  
  // 将自定义规则插到系统原有规则的最前面
  config.rules = myExtraRules.concat(config.rules);

  return config;
}
