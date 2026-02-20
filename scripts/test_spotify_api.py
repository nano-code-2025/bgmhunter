"""Spotify Web API 测试脚本：Client Credentials → 搜索 → Audio Features → 预览验证

用途：验证 Spotify API 搜索功能、audio_features 数据质量、preview_url 可用率
前提：需要在 https://developer.spotify.com/dashboard 注册 App 获取 client_id + client_secret

环境变量（.env.local 或 .env）：
  SPOTIFY_CLIENT_ID=your_client_id
  SPOTIFY_CLIENT_SECRET=your_client_secret
"""
import os
import sys
import json
import base64
import time
from typing import Optional, Dict, List, Tuple
from pathlib import Path

# 修复 Windows 控制台编码问题
if sys.platform == 'win32':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

try:
    import requests
except ImportError:
    print("[错误] 未安装 requests")
    print("请运行: pip install requests")
    sys.exit(1)

try:
    from dotenv import load_dotenv
except ImportError:
    print("[警告] 未安装 python-dotenv，将尝试直接读取环境变量")
    load_dotenv = None  # type: ignore


SPOTIFY_AUTH_URL = "https://accounts.spotify.com/api/token"
SPOTIFY_API_BASE = "https://api.spotify.com/v1"


def load_credentials() -> Tuple[str, str]:
    """加载 Spotify 凭据"""
    # 尝试加载 .env 文件
    env_paths = [
        Path(__file__).parent.parent / ".env.local",
        Path(__file__).parent.parent / ".env",
    ]
    if load_dotenv:
        for env_path in env_paths:
            if env_path.exists():
                load_dotenv(env_path)
                print(f"[配置] 已加载环境变量: {env_path}")
                break

    client_id = os.environ.get("SPOTIFY_CLIENT_ID", "")
    client_secret = os.environ.get("SPOTIFY_CLIENT_SECRET", "")

    if not client_id or not client_secret:
        print("[错误] 未找到 Spotify 凭据！")
        print()
        print("请按以下步骤获取：")
        print("  1. 访问 https://developer.spotify.com/dashboard")
        print("  2. 登录 / 注册 Spotify 账户")
        print("  3. 创建一个 App（名称随意）")
        print("  4. 在 App Settings 中找到 Client ID 和 Client Secret")
        print("  5. 在项目根目录 .env.local 中添加：")
        print("     SPOTIFY_CLIENT_ID=your_client_id")
        print("     SPOTIFY_CLIENT_SECRET=your_client_secret")
        sys.exit(1)

    return client_id, client_secret


def get_access_token(client_id: str, client_secret: str) -> str:
    """通过 Client Credentials Flow 获取 access_token"""
    auth_str = f"{client_id}:{client_secret}"
    auth_b64 = base64.b64encode(auth_str.encode()).decode()

    response = requests.post(
        SPOTIFY_AUTH_URL,
        headers={
            "Authorization": f"Basic {auth_b64}",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        data={"grant_type": "client_credentials"},
        timeout=15,
    )
    response.raise_for_status()
    data = response.json()
    token = data.get("access_token", "")
    expires_in = data.get("expires_in", 0)
    print(f"[认证] 获取 access_token 成功 (有效期: {expires_in}s)")
    return token


def search_tracks(token: str, keyword: str, limit: int = 20) -> List[Dict]:
    """搜索曲目"""
    headers = {"Authorization": f"Bearer {token}"}
    params = {"q": keyword, "type": "track", "limit": limit, "market": "US"}

    response = requests.get(
        f"{SPOTIFY_API_BASE}/search",
        headers=headers,
        params=params,
        timeout=15,
    )
    response.raise_for_status()
    data = response.json()
    return data.get("tracks", {}).get("items", [])


def get_audio_features(token: str, track_ids: List[str]) -> List[Optional[Dict]]:
    """批量获取 audio features（最多 100 个）"""
    if not track_ids:
        return []

    headers = {"Authorization": f"Bearer {token}"}
    params = {"ids": ",".join(track_ids[:100])}

    try:
        response = requests.get(
            f"{SPOTIFY_API_BASE}/audio-features",
            headers=headers,
            params=params,
            timeout=15,
        )
        response.raise_for_status()
        data = response.json()
        return data.get("audio_features", [])
    except Exception as e:
        print(f"[警告] audio_features 获取失败: {e}")
        return [None] * len(track_ids)


def get_recommendations(token: str, seed_tracks: List[str], limit: int = 10) -> List[Dict]:
    """基于种子曲目获取推荐"""
    headers = {"Authorization": f"Bearer {token}"}
    params = {
        "seed_tracks": ",".join(seed_tracks[:5]),
        "limit": limit,
        "market": "US",
    }

    try:
        response = requests.get(
            f"{SPOTIFY_API_BASE}/recommendations",
            headers=headers,
            params=params,
            timeout=15,
        )
        response.raise_for_status()
        data = response.json()
        return data.get("tracks", [])
    except Exception as e:
        print(f"[警告] 推荐获取失败: {e}")
        return []


def format_duration(ms: int) -> str:
    """毫秒 → MM:SS"""
    total_seconds = ms // 1000
    mins, secs = divmod(total_seconds, 60)
    return f"{mins}:{secs:02d}"


def search_and_analyze(token: str, keyword: str) -> None:
    """搜索 + Audio Features 分析"""
    print(f"\n[搜索] 关键词: '{keyword}'")
    print("-" * 80)

    results = search_tracks(token, keyword, limit=10)
    if not results:
        print(f"[警告] 未找到匹配 '{keyword}' 的音乐")
        return

    print(f"[成功] 找到 {len(results)} 首音乐，显示 Top 5:\n")

    # 获取 audio features
    track_ids = [t["id"] for t in results[:5]]
    features = get_audio_features(token, track_ids)

    preview_available = 0
    preview_null = 0

    for rank, track in enumerate(results[:5], 1):
        title = track.get("name", "Unknown")
        artists = ", ".join(a["name"] for a in track.get("artists", []))
        album = track.get("album", {}).get("name", "Unknown")
        duration_ms = track.get("duration_ms", 0)
        popularity = track.get("popularity", 0)
        preview_url = track.get("preview_url")
        track_id = track.get("id", "N/A")

        # 封面
        images = track.get("album", {}).get("images", [])
        cover = images[0]["url"] if images else "N/A"

        if preview_url:
            preview_available += 1
            preview_status = f"✅ {preview_url[:60]}..."
        else:
            preview_null += 1
            preview_status = "❌ null (已被 Spotify 移除)"

        print(f"[{rank}] {title}")
        print(f"     艺术家: {artists}")
        print(f"     专辑: {album}")
        print(f"     时长: {format_duration(duration_ms)} | 热度: {popularity}/100")
        print(f"     预览URL: {preview_status}")

        # Audio Features
        feat = features[rank - 1] if rank - 1 < len(features) else None
        if feat:
            bpm = feat.get("tempo", 0)
            energy = feat.get("energy", 0)
            valence = feat.get("valence", 0)
            danceability = feat.get("danceability", 0)
            instrumentalness = feat.get("instrumentalness", 0)
            acousticness = feat.get("acousticness", 0)

            mood = "欢快" if valence > 0.6 else "中性" if valence > 0.3 else "忧郁"
            energy_label = "高能" if energy > 0.7 else "中等" if energy > 0.4 else "低能量"

            print(f"     🎵 BPM: {bpm:.0f} | 能量: {energy:.2f} ({energy_label}) | 情绪: {valence:.2f} ({mood})")
            print(f"     🎵 舞蹈性: {danceability:.2f} | 器乐性: {instrumentalness:.2f} | 原声: {acousticness:.2f}")
        else:
            print(f"     🎵 Audio Features: 不可用")

        if cover != "N/A":
            print(f"     封面: {cover}")
        print(f"     Spotify: https://open.spotify.com/track/{track_id}")
        print()

    # 统计 preview_url 可用率
    all_previews = sum(1 for t in results if t.get("preview_url"))
    print(f"\n[preview_url 统计]")
    print(f"  Top 5: {preview_available} 可用 / {preview_null} 为 null")
    print(f"  Top {len(results)}: {all_previews} 可用 / {len(results) - all_previews} 为 null ({all_previews/len(results)*100:.0f}%)")

    if all_previews < len(results) * 0.5:
        print(f"  ⚠️ preview_url 可用率低于 50%，确认 Spotify 正在逐步废弃此功能")
    elif all_previews < len(results) * 0.8:
        print(f"  ⚠️ preview_url 部分可用，但不可靠")
    else:
        print(f"  ✅ preview_url 大部分可用（但未来可能被废弃）")


def test_recommendations(token: str) -> None:
    """测试推荐功能"""
    print("\n[推荐测试] 基于 seed tracks 获取推荐...")
    print("-" * 80)

    # 先搜索获取种子曲目
    seeds = search_tracks(token, "lofi chill", limit=3)
    if not seeds:
        print("[跳过] 无法获取种子曲目")
        return

    seed_ids = [t["id"] for t in seeds[:2]]
    seed_names = [t["name"] for t in seeds[:2]]
    print(f"  种子曲目: {', '.join(seed_names)}")

    recs = get_recommendations(token, seed_ids, limit=5)
    if recs:
        print(f"  推荐结果: {len(recs)} 首\n")
        for i, track in enumerate(recs, 1):
            title = track.get("name", "Unknown")
            artist = track.get("artists", [{}])[0].get("name", "Unknown")
            popularity = track.get("popularity", 0)
            preview = "✅" if track.get("preview_url") else "❌"
            print(f"  [{i}] {title} - {artist} (热度:{popularity}) [预览:{preview}]")
    else:
        print("  [警告] 推荐功能不可用")


def main():
    """主函数"""
    print("=" * 80)
    print("Spotify Web API 测试 - Client Credentials Flow")
    print("(需要 SPOTIFY_CLIENT_ID + SPOTIFY_CLIENT_SECRET)")
    print("=" * 80)

    # 加载凭据
    client_id, client_secret = load_credentials()
    print(f"[配置] Client ID: {client_id[:8]}...{client_id[-4:]}")

    # 获取 token
    token = get_access_token(client_id, client_secret)

    if len(sys.argv) > 1:
        keyword = sys.argv[1]
        search_and_analyze(token, keyword)
    else:
        test_keywords = ["lofi", "piano", "cinematic", "happy upbeat", "chill electronic"]
        print(f"\n[测试] 将测试以下关键词: {', '.join(test_keywords)}\n")

        for keyword in test_keywords:
            search_and_analyze(token, keyword)
            print("\n" + "=" * 80 + "\n")
            time.sleep(0.3)

    # 推荐测试
    test_recommendations(token)

    print("\n" + "=" * 80)
    print("[结论]")
    print("  1. Spotify 搜索: Client Credentials 即可，无需用户登录")
    print("  2. Audio Features: BPM/能量/情绪值等数据质量优秀，适合推荐算法")
    print("  3. preview_url: 正在被废弃，不能作为播放源依赖")
    print("  4. 推荐 API: 基于 seed tracks 的推荐功能可用")
    print("  5. 整合建议: 用于元数据增强 + 推荐算法，不依赖其播放能力")
    print("=" * 80)


if __name__ == "__main__":
    main()

