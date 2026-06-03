#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
灰度发布策略引擎
使用一致性哈希实现稳定的版本分配
"""

import hashlib
import json
import logging
from pathlib import Path
from typing import Optional, Dict, Any, List
from datetime import datetime

logger = logging.getLogger(__name__)


class RolloutConfig:
    """灰度发布配置"""

    def __init__(self, data: Dict[str, Any]):
        self.enabled = data.get('enabled', False)
        # test-workbench_change: 移除 target_version 和 target_commit，改为从 product.json 读取
        self.rollout_percentage = data.get('rollout_percentage', 0.0)
        self.salt = data.get('salt', 'default-salt')
        self.whitelist = set(data.get('whitelist', []))
        self.blacklist = set(data.get('blacklist', []))
        self.paused = data.get('paused', False)
        self.stages = data.get('stages', [])
        self.current_stage = data.get('current_stage', 0)
        self.created_at = data.get('created_at', datetime.now().isoformat())
        self.updated_at = data.get('updated_at', datetime.now().isoformat())

    def to_dict(self) -> Dict[str, Any]:
        """转换为字典"""
        return {
            'enabled': self.enabled,
            # test-workbench_change: 不再保存 target_version 和 target_commit
            'rollout_percentage': self.rollout_percentage,
            'salt': self.salt,
            'whitelist': list(self.whitelist),
            'blacklist': list(self.blacklist),
            'paused': self.paused,
            'stages': self.stages,
            'current_stage': self.current_stage,
            'created_at': self.created_at,
            'updated_at': self.updated_at
        }


class RolloutStrategyEngine:
    """灰度发布策略引擎"""

    def __init__(self, config_path: str = './packages/rollout-config.json', product_json_path: str = './packages/product.json'):
        self.config_path = Path(config_path)
        self.product_json_path = Path(product_json_path)  # test-workbench_change: 添加 product.json 路径
        self.configs: Dict[str, RolloutConfig] = {}
        self.global_settings: Dict[str, Any] = {}  # test-workbench_change: 存储全局设置
        self.load_config()

    def load_config(self) -> None:
        """加载配置文件"""
        if not self.config_path.exists():
            logger.info(f"配置文件不存在，创建默认配置: {self.config_path}")
            self.configs = {}
            self.global_settings = {
                'default_rollout_percentage': 100.0,
                'enable_metrics': True,
                'metrics_retention_days': 30,
                'enable_rollback': False
            }
            self.save_config()
            return

        try:
            with open(self.config_path, 'r', encoding='utf-8') as f:
                data = json.load(f)

            rollouts = data.get('rollouts', {})
            for key, config_data in rollouts.items():
                self.configs[key] = RolloutConfig(config_data)

            # test-workbench_change: 加载全局设置
            self.global_settings = data.get('global_settings', {
                'default_rollout_percentage': 100.0,
                'enable_metrics': True,
                'metrics_retention_days': 30,
                'enable_rollback': False
            })
            # test-workbench_change end

            logger.info(f"加载灰度配置成功: {len(self.configs)} 个配置")
            logger.info(f"回滚功能状态: {'启用' if self.global_settings.get('enable_rollback') else '禁用'}")
        except Exception as e:
            logger.error(f"加载配置文件失败: {e}")
            self.configs = {}
            self.global_settings = {
                'enable_rollback': False
            }

    # test-workbench_change: 添加从 product.json 读取版本信息的方法
    def get_product_info(self) -> Dict[str, str]:
        """
        从 product.json 读取版本信息

        Returns:
            包含 version 和 commit 的字典
        """
        try:
            if not self.product_json_path.exists():
                logger.error(f"product.json 不存在: {self.product_json_path}")
                return {'version': '', 'commit': ''}

            with open(self.product_json_path, 'r', encoding='utf-8') as f:
                product_data = json.load(f)

            return {
                'version': product_data.get('gitVersion', ''),
                'commit': product_data.get('commit', '')
            }
        except Exception as e:
            logger.error(f"读取 product.json 失败: {e}")
            return {'version': '', 'commit': ''}
    # test-workbench_change end

    def save_config(self) -> None:
        """保存配置文件"""
        try:
            # 确保目录存在
            self.config_path.parent.mkdir(parents=True, exist_ok=True)

            # test-workbench_change: 使用 self.global_settings 中的实际值
            data = {
                'rollouts': {
                    key: config.to_dict()
                    for key, config in self.configs.items()
                },
                'global_settings': self.global_settings  # 直接使用实际的全局设置
            }
            # test-workbench_change end

            with open(self.config_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)

            logger.info(f"保存配置成功: {self.config_path}")
        except Exception as e:
            logger.error(f"保存配置失败: {e}")

    def get_config(self, platform_quality: str) -> Optional[RolloutConfig]:
        """获取指定平台的配置"""
        return self.configs.get(platform_quality)

    def set_config(self, platform_quality: str, config: RolloutConfig) -> None:
        """设置配置"""
        config.updated_at = datetime.now().isoformat()
        self.configs[platform_quality] = config
        self.save_config()

    def decide_version(
        self,
        client_ip: str,
        client_id: str,
        current_commit: str,
        platform_quality: str
    ) -> str:
        """
        决定应该推送哪个版本

        Args:
            client_ip: 客户端 IP 地址（用于日志和白名单/黑名单）
            client_id: 客户端唯一标识（用于一致性哈希）
            current_commit: 客户端当前的 commit
            platform_quality: 平台和质量通道，如 "win32-x64-user/stable"

        Returns:
            目标 commit（如果返回 current_commit 则表示不更新）
        """
        config = self.get_config(platform_quality)

        # 如果没有配置或未启用，返回当前版本（不更新）
        if not config or not config.enabled:
            logger.debug(f"未启用灰度发布: {platform_quality}")
            return current_commit

        # test-workbench_change: 从 product.json 读取目标 commit
        product_info = self.get_product_info()
        target_commit = product_info['commit']

        if not target_commit:
            logger.error("无法从 product.json 读取 commit，保持当前版本")
            return current_commit
        # test-workbench_change end

        # 1. 检查白名单（强制更新）- 使用 IP
        if client_ip in config.whitelist:
            logger.info(f"客户端 {client_ip} 在白名单中，推送新版本")
            return target_commit

        # 2. 检查黑名单（禁止更新）- 使用 IP
        if client_ip in config.blacklist:
            logger.info(f"客户端 {client_ip} 在黑名单中，保持当前版本")
            return current_commit

        # 3. 检查暂停状态
        if config.paused:
            logger.info(f"灰度发布已暂停: {platform_quality}")
            return current_commit

        # 4. 一致性哈希分配 - 使用 client_id
        hash_value = self._consistent_hash(client_id, config.salt)
        percentage = (hash_value % 10000) / 100.0  # 0-100

        if percentage < config.rollout_percentage:
            logger.info(
                f"客户端 {client_ip} 分配到新版本 "
                f"(hash={percentage:.2f}% < {config.rollout_percentage}%)"
            )
            return target_commit
        else:
            logger.debug(
                f"客户端 {client_ip} 保持当前版本 "
                f"(hash={percentage:.2f}% >= {config.rollout_percentage}%)"
            )
            return current_commit

    def _consistent_hash(self, client_id: str, salt: str) -> int:
        """
        一致性哈希，确保同一客户端始终得到相同结果

        Args:
            client_id: 客户端 ID
            salt: 盐值（用于区分不同的发布）

        Returns:
            哈希值（0-2^32）
        """
        hash_input = f"{client_id}:{salt}"
        hash_hex = hashlib.sha256(hash_input.encode()).hexdigest()[:8]
        return int(hash_hex, 16)

    def create_rollout(
        self,
        platform_quality: str,
        rollout_percentage: float = 1.0,
        stages: Optional[List[Dict[str, Any]]] = None
    ) -> RolloutConfig:
        """
        创建新的灰度发布配置

        注意：target_version 和 target_commit 现在从 product.json 读取

        Args:
            platform_quality: 平台和质量通道
            rollout_percentage: 初始发布百分比
            stages: 发布阶段配置
        """
        # test-workbench_change: 从 product.json 读取版本信息用于日志
        product_info = self.get_product_info()
        target_version = product_info['version']
        # test-workbench_change end

        if stages is None:
            # 默认发布阶段
            stages = [
                {"percentage": 1.0, "duration_hours": 24},
                {"percentage": 5.0, "duration_hours": 48},
                {"percentage": 10.0, "duration_hours": 72},
                {"percentage": 25.0, "duration_hours": 72},
                {"percentage": 50.0, "duration_hours": 48},
                {"percentage": 100.0, "duration_hours": 0}
            ]

        config_data = {
            'enabled': True,
            # test-workbench_change: 不再存储 target_version 和 target_commit
            'rollout_percentage': rollout_percentage,
            'salt': f"{platform_quality}-{target_version}-{datetime.now().strftime('%Y%m%d')}",
            'whitelist': [],
            'blacklist': [],
            'paused': False,
            'stages': stages,
            'current_stage': 0,
            'created_at': datetime.now().isoformat(),
            'updated_at': datetime.now().isoformat()
        }

        config = RolloutConfig(config_data)
        self.set_config(platform_quality, config)

        logger.info(f"创建灰度发布配置: {platform_quality} -> {target_version}")
        return config

    def advance_stage(self, platform_quality: str) -> bool:
        """
        推进到下一阶段

        Returns:
            是否成功推进
        """
        config = self.get_config(platform_quality)
        if not config:
            logger.warning(f"未找到配置: {platform_quality}")
            return False

        if config.current_stage >= len(config.stages) - 1:
            logger.info(f"已经是最后阶段: {platform_quality}")
            return False

        config.current_stage += 1
        new_percentage = config.stages[config.current_stage]['percentage']
        config.rollout_percentage = new_percentage

        self.set_config(platform_quality, config)

        logger.info(
            f"推进到阶段 {config.current_stage}: "
            f"{platform_quality} -> {new_percentage}%"
        )
        return True

    def switch_to_stage(self, platform_quality: str, stage_index: int) -> bool:
        """
        切换到指定阶段

        Args:
            platform_quality: 平台/质量级别
            stage_index: 目标阶段索引（从0开始）

        Returns:
            是否成功切换
        """
        config = self.get_config(platform_quality)
        if not config:
            logger.warning(f"未找到配置: {platform_quality}")
            return False

        if stage_index < 0 or stage_index >= len(config.stages):
            logger.warning(f"无效的阶段索引: {stage_index}, 总阶段数: {len(config.stages)}")
            return False

        config.current_stage = stage_index
        new_percentage = config.stages[stage_index]['percentage']
        config.rollout_percentage = new_percentage

        self.set_config(platform_quality, config)

        logger.info(
            f"切换到阶段 {stage_index}: "
            f"{platform_quality} -> {new_percentage}%"
        )
        return True

    def pause_rollout(self, platform_quality: str) -> bool:
        """暂停灰度发布"""
        config = self.get_config(platform_quality)
        if not config:
            return False

        config.paused = True
        self.set_config(platform_quality, config)
        logger.info(f"暂停灰度发布: {platform_quality}")
        return True

    def resume_rollout(self, platform_quality: str) -> bool:
        """恢复灰度发布"""
        config = self.get_config(platform_quality)
        if not config:
            return False

        config.paused = False
        self.set_config(platform_quality, config)
        logger.info(f"恢复灰度发布: {platform_quality}")
        return True



    def add_to_whitelist(self, platform_quality: str, client_ip: str) -> bool:
        """添加到白名单（使用 IP 地址）"""
        config = self.get_config(platform_quality)
        if not config:
            return False

        config.whitelist.add(client_ip)
        self.set_config(platform_quality, config)
        logger.info(f"添加到白名单: {client_ip} -> {platform_quality}")
        return True

    def add_to_blacklist(self, platform_quality: str, client_ip: str) -> bool:
        """添加到黑名单（使用 IP 地址）"""
        config = self.get_config(platform_quality)
        if not config:
            return False

        config.blacklist.add(client_ip)
        self.set_config(platform_quality, config)
        logger.info(f"添加到黑名单: {client_ip} -> {platform_quality}")
        return True

    def remove_from_whitelist(self, platform_quality: str, client_ip: str) -> bool:
        """从白名单移除（使用 IP 地址）"""
        config = self.get_config(platform_quality)
        if not config:
            return False

        if client_ip in config.whitelist:
            config.whitelist.remove(client_ip)
            self.set_config(platform_quality, config)
            logger.info(f"从白名单移除: {client_ip} -> {platform_quality}")
            return True
        else:
            logger.warning(f"IP 不在白名单中: {client_ip} -> {platform_quality}")
            return False

    def remove_from_blacklist(self, platform_quality: str, client_ip: str) -> bool:
        """从黑名单移除（使用 IP 地址）"""
        config = self.get_config(platform_quality)
        if not config:
            return False

        if client_ip in config.blacklist:
            config.blacklist.remove(client_ip)
            self.set_config(platform_quality, config)
            logger.info(f"从黑名单移除: {client_ip} -> {platform_quality}")
            return True
        else:
            logger.warning(f"IP 不在黑名单中: {client_ip} -> {platform_quality}")
            return False

    def get_status(self, platform_quality: str) -> Optional[Dict[str, Any]]:
        """获取发布状态"""
        config = self.get_config(platform_quality)
        if not config:
            return None

        # test-workbench_change: 从 product.json 读取版本信息
        product_info = self.get_product_info()
        # test-workbench_change end

        return {
            'platform_quality': platform_quality,
            'enabled': config.enabled,
            'target_version': product_info['version'],  # test-workbench_change: 从 product.json 读取
            'target_commit': product_info['commit'],    # test-workbench_change: 从 product.json 读取
            'rollout_percentage': config.rollout_percentage,
            'current_stage': config.current_stage,
            'total_stages': len(config.stages),
            'stages': config.stages,
            'paused': config.paused,
            'whitelist': list(config.whitelist),
            'blacklist': list(config.blacklist),
            'whitelist_count': len(config.whitelist),
            'blacklist_count': len(config.blacklist),
            'created_at': config.created_at,
            'updated_at': config.updated_at,
            'enable_rollback': self.is_rollback_enabled()  # test-workbench_change: 添加回滚状态
        }

    # test-workbench_change: 回滚开关管理方法
    def is_rollback_enabled(self) -> bool:
        """检查回滚功能是否启用"""
        return self.global_settings.get('enable_rollback', False)

    def enable_rollback(self) -> bool:
        """启用回滚功能"""
        self.global_settings['enable_rollback'] = True
        self.save_config()
        logger.info("回滚功能已启用")
        return True

    def disable_rollback(self) -> bool:
        """禁用回滚功能"""
        self.global_settings['enable_rollback'] = False
        self.save_config()
        logger.info("回滚功能已禁用")
        return True

    def get_global_settings(self) -> Dict[str, Any]:
        """获取全局设置"""
        return self.global_settings.copy()
    # test-workbench_change end
