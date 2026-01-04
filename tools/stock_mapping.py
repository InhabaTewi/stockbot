import os
import logging
import akshare as ak
import pandas as pd
from sqlalchemy import create_engine, text
import pymysql
import time
import json
import requests
from datetime import datetime
import requests

# 解决走代理会报错问题
_old_session = requests.Session
class NoEnvProxySession(requests.Session):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.trust_env = False  

# 解决相对路径问题
current_dir = os.path.dirname(os.path.abspath(__file__))
log_dir = os.path.join(current_dir, "../../logs")
os.makedirs(log_dir, exist_ok=True)

# 配置日志
logger = logging.getLogger('stock_mapping')
logger.setLevel(logging.INFO)

log_path = os.path.join(log_dir, "stock_mapping.log")
file_handler = logging.FileHandler(log_path)
file_handler.setFormatter(logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s'))
logger.addHandler(file_handler)
logger.addHandler(logging.StreamHandler())

# 数据库配置 - 使用环境变量
DATABASE_CONFIG = {
    'user': os.getenv('DB_USER', 'root'),
    'password': os.getenv('DB_PASSWORD', 'Meiyoumima1'),
    'host': os.getenv('DB_HOST', 'localhost'),
    'port': os.getenv('DB_PORT', '3306'),
    'database': os.getenv('DB_NAME', 'stock_data')
}

# 数据表结构定义
TABLE_NAME = "stock_mapping"
TABLE_CREATION_SQL = f"""
CREATE TABLE IF NOT EXISTS {TABLE_NAME} (
    id INT AUTO_INCREMENT PRIMARY KEY,
    stock_code VARCHAR(20) NOT NULL,
    stock_name VARCHAR(200) NOT NULL,
    market VARCHAR(10) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    data_source VARCHAR(50),
    stock_fullcode VARCHAR(30),
    UNIQUE INDEX (stock_code, market),
    INDEX (stock_fullcode)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
"""

# 别名映射表结构定义
ALIAS_TABLE_NAME = "stock_aliases"
ALIAS_TABLE_CREATION_SQL = f"""
CREATE TABLE IF NOT EXISTS {ALIAS_TABLE_NAME} (
    id INT AUTO_INCREMENT PRIMARY KEY,
    alias VARCHAR(100) NOT NULL,
    stock_name VARCHAR(200) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE INDEX (alias),
    INDEX (stock_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
"""

def ensure_table_exists(engine, table_name, creation_sql):
    """确保所需的数据表存在"""
    try:
        # 使用autocommit模式和更短的连接超时
        with engine.connect() as conn:
            logger.info(f"创建或验证表 '{table_name}'...")
            # 执行创建表语句
            conn.execute(text(creation_sql))
            conn.commit()  # 显式提交
            logger.info(f"表 '{table_name}' 创建或验证成功")
            return True
    except Exception as e:
        logger.error(f"创建表失败: {str(e)}", exc_info=True)
        return False

def fetch_stock_data():
    """获取A股和港股数据"""
    logger.info("从AkShare获取股票数据...")
    stocks = []
    
    try:
        # 沪市A股
        df_sh = ak.stock_info_sh_name_code()
        if not df_sh.empty:
            for _, row in df_sh.iterrows():
                stock_code = row.get('证券代码', '')
                stock_name = row.get('证券简称', '')
                
                if stock_code and stock_name and str(stock_code).startswith('6'):
                    stocks.append({
                        "stock_code": stock_code,
                        "stock_name": stock_name,
                        "market": "SH",
                        "data_source": "akshare",
                        "stock_fullcode": f"SH{stock_code}"
                    })
            logger.info(f"获取 {len(stocks)} 只上海股票")
        else:
            logger.warning("未获取到上海股票数据")
            
        # 深市A股
        df_sz = ak.stock_info_sz_name_code()
        if not df_sz.empty:
            start_count = len(stocks)
            for _, row in df_sz.iterrows():
                stock_code = str(row.get('A股代码', ''))
                stock_name = row.get('A股简称', '')
                
                if stock_code and stock_name and stock_code.startswith(('0', '3')):
                    stocks.append({
                        "stock_code": stock_code,
                        "stock_name": stock_name,
                        "market": "SZ",
                        "data_source": "akshare",
                        "stock_fullcode": f"SZ{stock_code}"
                    })
            logger.info(f"获取 {len(stocks) - start_count} 只深圳股票")
        else:
            logger.warning("未获取到深圳股票数据")
            
        # 港股
        df_hk = ak.stock_hk_spot_em()
        if not df_hk.empty:
            start_count = len(stocks)
            for _, row in df_hk.iterrows():
                stock_code = str(row.get('代码', '')).strip()
                stock_name = row.get('名称', '')
                
                # 特殊处理小米集团-W
                if stock_code == "01810":
                    stock_name = "小米集团-W"
                # 特殊处理美团-W
                elif stock_code == "03690":
                    stock_name = "美团-W"
                
                if stock_code and stock_name:
                    stocks.append({
                        "stock_code": stock_code,
                        "stock_name": stock_name,
                        "market": "HK",
                        "data_source": "akshare",
                        "stock_fullcode": f"HK{stock_code}"
                    })
            logger.info(f"获取 {len(stocks) - start_count} 只香港股票")
        else:
            logger.warning("未获取到香港股票数据")
            
    except Exception as e:
        logger.error(f"获取股票数据错误: {str(e)}", exc_info=True)
    
    logger.info(f"总共获取 {len(stocks)} 条股票记录")
    return stocks

def fetch_aliases_from_api():
    """从API获取公司别名映射"""
    logger.info("从API获取公司别名映射...")
    aliases = {}
    
    try:
        # 这里使用一个示例API，实际应替换为真实的别名API
        response = requests.get("https://api.example.com/stock_aliases", timeout=10)
        if response.status_code == 200:
            data = response.json()
            for item in data:
                aliases[item['alias']] = item['stock_name']
            logger.info(f"从API获取 {len(aliases)} 个别名映射")
        else:
            logger.warning(f"API返回错误状态码: {response.status_code}")
    except Exception as e:
        logger.error(f"获取别名映射失败: {str(e)}")
    
    return aliases

def generate_common_aliases(stocks):
    """基于股票名称生成常见别名"""
    logger.info("生成常见别名映射...")
    aliases = {}
    
    for stock in stocks:
        stock_name = stock['stock_name']
        stock_code = stock['stock_code']
        market = stock['market']
        
        # 生成常见别名，避免重复
        if "集团" in stock_name:
            alias1 = stock_name.replace("集团", "")
            if alias1 and alias1 != stock_name:
                if alias1 not in aliases:
                    aliases[alias1] = stock_name
                elif aliases[alias1] != stock_name:
                    # 如果别名冲突，添加市场标识
                    aliases[f"{alias1}_{market}"] = stock_name
        
        if "股份" in stock_name:
            alias2 = stock_name.replace("股份", "")
            alias3 = stock_name.replace("股份", "公司")
            
            if alias2 and alias2 != stock_name:
                if alias2 not in aliases:
                    aliases[alias2] = stock_name
                elif aliases[alias2] != stock_name:
                    aliases[f"{alias2}_{market}"] = stock_name
                    
            if alias3 and alias3 != stock_name:
                if alias3 not in aliases:
                    aliases[alias3] = stock_name
                elif aliases[alias3] != stock_name:
                    aliases[f"{alias3}_{market}"] = stock_name
        
        if "有限" in stock_name:
            alias4 = stock_name.replace("有限", "")
            if alias4 and alias4 != stock_name:
                if alias4 not in aliases:
                    aliases[alias4] = stock_name
                elif aliases[alias4] != stock_name:
                    aliases[f"{alias4}_{market}"] = stock_name
        
        # 生成拼音首字母缩写，处理重复问题
        try:
            from pypinyin import pinyin, Style
            initials = ''.join([p[0][0] for p in pinyin(stock_name, style=Style.FIRST_LETTER)])
            if initials and len(initials) > 1:
                if initials not in aliases:
                    aliases[initials] = stock_name
                elif aliases[initials] != stock_name:
                    # 拼音缩写冲突时，添加股票代码后缀
                    aliases[f"{initials}_{stock_code}"] = stock_name
        except ImportError:
            logger.warning("pypinyin未安装，跳过拼音别名生成")
        
        # 生成英文缩写
        if "(" in stock_name and ")" in stock_name:
            eng_name = stock_name.split("(")[1].split(")")[0]
            if eng_name:
                if eng_name not in aliases:
                    aliases[eng_name] = stock_name
                elif aliases[eng_name] != stock_name:
                    aliases[f"{eng_name}_{market}"] = stock_name
    
    logger.info(f"生成 {len(aliases)} 个常见别名")
    return aliases

def update_stock_mapping():
    """更新股票映射表"""
    try:
        # 数据库连接 - 添加连接池和超时配置
        db_url = f"mysql+pymysql://{DATABASE_CONFIG['user']}:{DATABASE_CONFIG['password']}@" \
                f"{DATABASE_CONFIG['host']}:{DATABASE_CONFIG['port']}/{DATABASE_CONFIG['database']}" \
                f"?charset=utf8mb4&autocommit=true"
        
        engine = create_engine(
            db_url,
            pool_size=5,
            max_overflow=10,
            pool_timeout=30,
            pool_recycle=3600,
            pool_pre_ping=True,
            echo=False
        )
        
        # 确保表存在
        if not ensure_table_exists(engine, TABLE_NAME, TABLE_CREATION_SQL):
            logger.error("无法确保股票映射表存在")
            return False
        
        if not ensure_table_exists(engine, ALIAS_TABLE_NAME, ALIAS_TABLE_CREATION_SQL):
            logger.error("无法确保别名映射表存在")
            return False
        
        # 获取股票数据
        stocks = fetch_stock_data()
        if not stocks:
            logger.error("未获取到股票数据")
            return False
            
        # 转换为DataFrame
        df = pd.DataFrame(stocks)
        
        # 导入数据库
        with engine.connect() as conn:
            # 清空表并重新加载
            logger.info("导入前清空股票映射表...")
            conn.execute(text(f"TRUNCATE TABLE {TABLE_NAME}"))
            
            # 插入新数据
            logger.info(f"导入 {len(df)} 条记录到股票映射表...")
            df.to_sql(
                name=TABLE_NAME,
                con=engine,
                if_exists='append',
                index=False,
                chunksize=1000,
                method='multi'
            )
            
            # 获取别名映射
            aliases = fetch_aliases_from_api()
            if not aliases:
                logger.info("从API获取别名失败，生成常见别名")
                aliases = generate_common_aliases(stocks)
            
            # 导入别名映射
            logger.info("导入前清空别名映射表...")
            conn.execute(text(f"TRUNCATE TABLE {ALIAS_TABLE_NAME}"))
            
            if aliases:
                alias_data = [{"alias": k, "stock_name": v} for k, v in aliases.items()]
                alias_df = pd.DataFrame(alias_data)
                
                logger.info(f"导入 {len(alias_df)} 条记录到别名映射表...")
                
                # 使用逐条插入的方式，忽略重复键错误
                with engine.connect() as conn:
                    success_count = 0
                    error_count = 0
                    
                    for _, row in alias_df.iterrows():
                        try:
                            insert_sql = text(f"""
                                INSERT IGNORE INTO {ALIAS_TABLE_NAME} (alias, stock_name) 
                                VALUES (:alias, :stock_name)
                            """)
                            result = conn.execute(insert_sql, {
                                "alias": row['alias'], 
                                "stock_name": row['stock_name']
                            })
                            if result.rowcount > 0:
                                success_count += 1
                            else:
                                error_count += 1
                        except Exception as e:
                            error_count += 1
                            logger.debug(f"跳过重复别名: {row['alias']} -> {row['stock_name']}")
                    
                    conn.commit()
                    logger.info(f"成功插入 {success_count} 条别名记录，跳过 {error_count} 条重复记录")
            
        logger.info(f"成功更新股票映射和别名映射")
        return True
        
    except Exception as e:
        logger.error(f"更新股票映射失败: {str(e)}", exc_info=True)
        return False
    finally:
        if 'engine' in locals():
            engine.dispose()

def get_aliases_from_db(engine):
    """从数据库获取别名映射"""
    aliases = {}
    
    try:
        with engine.connect() as conn:
            query = text(f"SELECT alias, stock_name FROM {ALIAS_TABLE_NAME}")
            rows = conn.execute(query).fetchall()
            
            for row in rows:
                aliases[row[0]] = row[1]
            
            logger.info(f"从数据库获取 {len(aliases)} 个别名映射")
    except Exception as e:
        logger.error(f"获取别名映射失败: {str(e)}")
    
    return aliases

def get_stock_code(name):
    """
    查询股票代码 - 支持中英文和公司别名
    """
    if not name or not isinstance(name, str) or len(name) < 1:
        logger.warning(f"无效的股票名称参数: {name}")
        return []
    
    # 构造数据库连接字符串 - 添加更多连接参数
    db_url = f"mysql+pymysql://{DATABASE_CONFIG['user']}:{DATABASE_CONFIG['password']}@" \
             f"{DATABASE_CONFIG['host']}:{DATABASE_CONFIG['port']}/{DATABASE_CONFIG['database']}" \
             f"?charset=utf8mb4&autocommit=true&connect_timeout=10"
    
    try:
        # 创建数据库连接引擎 - 优化连接池配置
        engine = create_engine(
            db_url,
            pool_size=3,
            max_overflow=5,
            pool_timeout=20,
            pool_recycle=1800,
            pool_pre_ping=True,
            echo=False
        )
        
        # 确保数据表存在
        if not ensure_table_exists(engine, TABLE_NAME, TABLE_CREATION_SQL):
            logger.error("无法确保股票映射表存在")
            return []
        
        if not ensure_table_exists(engine, ALIAS_TABLE_NAME, ALIAS_TABLE_CREATION_SQL):
            logger.error("无法确保别名映射表存在")
            return []
        
        # 获取别名映射
        aliases = get_aliases_from_db(engine)
        
        # 应用别名映射
        query_names = [name]
        if name in aliases:
            query_names.append(aliases[name])
        
        # 执行查询
        with engine.connect() as conn:
            results = []
            
            # 尝试通过股票名称和别名查询
            for q_name in query_names:
                query = text(f"""
                    SELECT stock_code, market, stock_fullcode, stock_name 
                    FROM {TABLE_NAME} 
                    WHERE stock_name LIKE :name
                    LIMIT 20
                """)
                rows = conn.execute(query, {"name": f"%{q_name}%"}).fetchall()
                
                for row in rows:
                    result = {
                        "stock_code": row[0],
                        "market": row[1],
                        "stock_fullcode": row[2],
                        "stock_name": row[3]
                    }
                    if result not in results:
                        results.append(result)
            
            logger.info(f"找到 {len(results)} 个匹配项: {name}")
            return results
            
    except Exception as e:
        logger.error(f"股票名称查询失败: {name}, {str(e)}", exc_info=True)
        return []
    finally:
        if 'engine' in locals():
            engine.dispose()

def main():
    """服务主入口"""
    import argparse
    parser = argparse.ArgumentParser(description='股票映射服务')
    parser.add_argument('action', choices=['serve', 'update'], help='服务模式或更新模式')
    args = parser.parse_args()
    
    if args.action == 'update':
        logger.info("开始更新股票映射...")
        success = update_stock_mapping()
        if success:
            logger.info("✅ 股票映射更新成功")
            exit(0)
        else:
            logger.error("❌ 股票映射更新失败")
            exit(1)
    
    # 服务模式逻辑
    logger.info("服务模式激活...")
    update_stock_mapping()  # 启动时先更新一次
    
    try:
        while True:
            # 每24小时更新一次
            import time
            time.sleep(24 * 3600)
            logger.info("执行每日股票映射更新...")
            update_stock_mapping()
    except KeyboardInterrupt:
        logger.info("服务手动停止")

if __name__ == "__main__":
    # 加载环境变量
    from dotenv import load_dotenv
    project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    env_path = os.path.join(project_root, '.env')
    
    if os.path.exists(env_path):
        load_dotenv(dotenv_path=env_path)
        logger.info(f"从 {env_path} 加载环境变量")
    else:
        logger.warning(f"在 {env_path} 未找到环境文件，使用系统环境变量")
    
    main()
