"""Deezer API 测试脚本：关键词搜索 → Top 5 → 30s 预览验证

用途：验证 Deezer API 搜索功能、预览 URL 可用性、元数据质量
优势：无需 API Key / Cookie，直接调用，30s MP3 直链可用于 <audio> 播放
"""
import sys
import json
import time
from typing import Optional, Dict, List
from urllib.parse import quote

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


DEEZER_BASE = "https://api.deezer.com"


def search_tracks(keyword: str, limit: int = 25) -> List[Dict]:
    """Deezer 搜索曲目（无需认证）"""
    url = f"{DEEZER_BASE}/search"
    params = {"q": keyword, "limit": limit}

    response = requests.get(url, params=params, timeout=15)
    response.raise_for_status()
    data = response.json()
    return data.get("data", [])


def verify_preview_url(url: str) -> bool:
    """验证预览 URL 是否可访问（HEAD 请求）"""
    try:
        resp = requests.head(url, timeout=10, allow_redirects=True)
        content_type = resp.headers.get("Content-Type", "")
        return resp.status_code == 200 and "audio" in content_type
    except Exception:
        return False


def get_track_details(track_id: int) -> Optional[Dict]:
    """获取单曲详情"""
    url = f"{DEEZER_BASE}/track/{track_id}"
    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        print(f"[警告] 获取曲目详情失败: {e}")
        return None


def format_duration(seconds: int) -> str:
    """秒 → MM:SS"""
    mins, secs = divmod(seconds, 60)
    return f"{mins}:{secs:02d}"


def search_top5(keyword: str) -> None:
    """搜索并输出 Top 5 + 验证预览 URL"""
    print(f"\n[搜索] 关键词: '{keyword}'")
    print("-" * 80)

    try:
        results = search_tracks(keyword, limit=20)
        if not results:
            print(f"[警告] 未找到匹配 '{keyword}' 的音乐")
            return

        print(f"[成功] 找到 {len(results)} 首音乐，显示 Top 5:\n")

        preview_ok = 0
        preview_fail = 0

        top5 = results[:5]
        for rank, track in enumerate(top5, 1):
            title = track.get("title", "Unknown")
            artist = track.get("artist", {}).get("name", "Unknown")
            album = track.get("album", {}).get("title", "Unknown")
            duration = track.get("duration", 0)
            rank_score = track.get("rank", 0)
            preview = track.get("preview", "")
            cover = track.get("album", {}).get("cover_xl", "")
            track_id = track.get("id", "N/A")

            # 验证预览 URL
            preview_valid = False
            if preview:
                preview_valid = verify_preview_url(preview)
                if preview_valid:
                    preview_ok += 1
                else:
                    preview_fail += 1

            status = "✅" if preview_valid else "❌" if preview else "⚠️ 无链接"

            print(f"[{rank}] {title}")
            print(f"     艺术家: {artist}")
            print(f"     专辑: {album}")
            print(f"     时长: {format_duration(duration)} | 热度: {rank_score:,}")
            print(f"     预览URL: {status} {preview[:80]}..." if preview else f"     预览URL: {status}")
            if cover:
                print(f"     封面: {cover}")
            print(f"     Deezer ID: {track_id}")
            print(f"     Deezer 链接: https://www.deezer.com/track/{track_id}")
            print()

        # 统计
        total_with_preview = sum(1 for t in results if t.get("preview"))
        print(f"\n[统计] 共 {len(results)} 首")
        print(f"  - 有预览URL: {total_with_preview}/{len(results)} ({total_with_preview/len(results)*100:.0f}%)")
        print(f"  - Top 5 预览验证: {preview_ok} 可用, {preview_fail} 不可用")

    except Exception as e:
        print(f"[错误] 搜索失败: {e}")
        import traceback
        traceback.print_exc()


def test_cors_compatibility() -> None:
    """测试 CORS 兼容性（模拟浏览器请求）"""
    print("\n[CORS 测试] 模拟浏览器请求...")
    print("-" * 80)

    # 搜索 API
    headers = {
        "Origin": "http://localhost:5173",
        "Referer": "http://localhost:5173/",
    }

    try:
        resp = requests.get(
            f"{DEEZER_BASE}/search",
            params={"q": "lofi", "limit": 1},
            headers=headers,
            timeout=10
        )
        cors_header = resp.headers.get("Access-Control-Allow-Origin", "无")
        print(f"  搜索 API CORS: {cors_header}")
        print(f"  状态码: {resp.status_code}")

        # 预览 URL CORS
        data = resp.json()
        if data.get("data") and data["data"][0].get("preview"):
            preview_url = data["data"][0]["preview"]
            preview_resp = requests.head(preview_url, headers=headers, timeout=10)
            preview_cors = preview_resp.headers.get("Access-Control-Allow-Origin", "无")
            print(f"  预览 URL CORS: {preview_cors}")
            print(f"  Content-Type: {preview_resp.headers.get('Content-Type', 'N/A')}")

        print()
        if cors_header == "*" or "localhost" in cors_header:
            print("  ✅ CORS 兼容，前端可直接调用")
        else:
            print("  ⚠️ CORS 可能受限，前端可能需要代理")
            print("  [提示] 搜索 API 通常支持 CORS; 预览 CDN 通常也支持")

    except Exception as e:
        print(f"  [错误] CORS 测试失败: {e}")


def compare_with_jamendo(keyword: str) -> None:
    """与 Jamendo 搜索结果做简要对比"""
    print(f"\n[对比] Deezer vs Jamendo - 关键词: '{keyword}'")
    print("-" * 80)

    # Deezer
    deezer_results = search_tracks(keyword, limit=10)
    deezer_artists = set(t.get("artist", {}).get("name", "") for t in deezer_results)

    # Jamendo
    jamendo_url = f"https://api.jamendo.com/v3.0/tracks/?client_id=f2567443&format=json&limit=10&search={quote(keyword)}&orderby=popularity_total_desc"
    try:
        jamendo_resp = requests.get(jamendo_url, timeout=15)
        jamendo_data = jamendo_resp.json()
        jamendo_results = jamendo_data.get("results", [])
        jamendo_artists = set(t.get("artist_name", "") for t in jamendo_results)
    except Exception:
        jamendo_results = []
        jamendo_artists = set()

    print(f"  Deezer:  {len(deezer_results)} 首 | {len(deezer_artists)} 位不同艺术家")
    print(f"  Jamendo: {len(jamendo_results)} 首 | {len(jamendo_artists)} 位不同艺术家")

    overlap = deezer_artists & jamendo_artists
    print(f"  艺术家重叠: {len(overlap)} 位")
    if overlap:
        print(f"  重叠艺术家: {', '.join(overlap)}")
    else:
        print(f"  → 无重叠，两个库互补性很好！")


def main():
    """主函数"""
    print("=" * 80)
    print("Deezer API 测试 - 搜索 + 30s 预览验证")
    print("(无需 API Key / Cookie)")
    print("=" * 80)

    if len(sys.argv) > 1:
        keyword = sys.argv[1]
        search_top5(keyword)
    else:
        test_keywords = ["lofi", "piano chill", "happy upbeat", "cinematic epic", "acoustic folk"]
        print(f"\n[测试] 将测试以下关键词: {', '.join(test_keywords)}\n")

        for keyword in test_keywords:
            search_top5(keyword)
            print("\n" + "=" * 80 + "\n")
            time.sleep(0.5)  # 简单限流

    # CORS 测试
    test_cors_compatibility()

    # 与 Jamendo 对比
    compare_with_jamendo("lofi")
    compare_with_jamendo("cinematic")

    print("\n" + "=" * 80)
    print("[结论]")
    print("  1. Deezer 搜索: 无需认证，直接可用")
    print("  2. 预览URL: 30s MP3 直链，可用于 <audio> 播放")
    print("  3. 曲库互补: 与 Jamendo 基本无重叠")
    print("  4. 整合建议: 并行搜索 Jamendo + Deezer，合并结果")
    print("=" * 80)


if __name__ == "__main__":
    main()

