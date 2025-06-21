#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Тестовый скрипт для проверки генератора статей
"""

import os
import sys
from pathlib import Path

# Добавляем текущую директорию в путь для импорта
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from create_articles import ArticleGenerator


def test_article_generation():
    """Тестирует генерацию статей в тестовом режиме"""
    print("🧪 Запуск тестов генератора статей")
    print("=" * 40)
    
    # Создаем генератор в тестовом режиме
    generator = ArticleGenerator("test-key", test_mode=True)
    
    # Тестируем генерацию статьи
    test_topic = "Тестовая тема для проверки"
    success = generator.generate_article(test_topic)
    
    if success:
        print("✅ Тест пройден: статья сгенерирована успешно")
        
        # Проверяем созданный файл
        output_files = list(generator.output_dir.glob("*.html"))
        if output_files:
            latest_file = max(output_files, key=lambda f: f.stat().st_mtime)
            print(f"✅ Создан файл: {latest_file}")
            
            # Проверяем содержимое
            with open(latest_file, 'r', encoding='utf-8') as f:
                content = f.read()
                
            # Проверяем наличие обязательных элементов
            required_elements = [
                '<!DOCTYPE html>',
                '<html lang="ru">',
                '<meta charset="UTF-8">',
                'class="interactive-container"',
                'class="chapter"',
                'class="info-block"',
                'class="date-box"',
                'class="fact-box"',
                'class="special-box"',
                'class="quiz-container"',
                'data-question=',
                'data-correct=',
                'function updateProgress()',
                'function checkAnswers()',
                '_progress_bar"',  # Измененный паттерн для уникальных ID
                '_final_score"'    # Измененный паттерн для уникальных ID
            ]
            
            missing_elements = []
            for element in required_elements:
                if element not in content:
                    missing_elements.append(element)
            
            if missing_elements:
                print(f"❌ Отсутствуют элементы: {missing_elements}")
                return False
            else:
                print("✅ Все обязательные элементы присутствуют")
                print(f"📊 Размер файла: {len(content)} символов")
                return True
        else:
            print("❌ Файл не был создан")
            return False
    else:
        print("❌ Тест не пройден: ошибка генерации статьи")
        return False


def test_filename_generation():
    """Тестирует генерацию имен файлов"""
    print("\n🧪 Тест генерации имен файлов")
    print("-" * 30)
    
    generator = ArticleGenerator("test-key", test_mode=True)
    
    test_topics = [
        "Простая тема",
        "Тема с символами @#$%^&*()",
        "Очень длинная тема с множеством слов которая должна быть обрезана до разумной длины",
        "Тема с эмодзи 🚀📚💡",
        "English Topic Mixed Русский"
    ]
    
    for topic in test_topics:
        filename = generator.generate_unique_filename(topic)
        print(f"'{topic}' -> '{filename}'")
        
        # Проверяем, что имя файла валидное
        if filename.endswith('.html') and 'article_' in filename:
            print("  ✅ Валидное имя файла")
        else:
            print("  ❌ Невалидное имя файла")
            return False
    
    return True


def test_id_prefix_generation():
    """Тестирует генерацию уникальных префиксов"""
    print("\n🧪 Тест генерации ID префиксов")
    print("-" * 30)
    
    generator = ArticleGenerator("test-key", test_mode=True)
    
    prefixes = set()
    for i in range(10):
        prefix = generator.generate_id_prefix()
        print(f"Префикс {i+1}: {prefix}")
        
        if prefix in prefixes:
            print("❌ Обнаружен дубликат префикса")
            return False
        
        prefixes.add(prefix)
        
        if not prefix.startswith('art_') or len(prefix) != 12:
            print(f"❌ Неправильный формат префикса: {prefix}")
            return False
    
    print("✅ Все префиксы уникальны и имеют правильный формат")
    return True


def main():
    """Запускает все тесты"""
    print("🚀 Полный набор тестов генератора статей")
    print("=" * 50)
    
    tests = [
        ("Генерация статей", test_article_generation),
        ("Генерация имен файлов", test_filename_generation),
        ("Генерация ID префиксов", test_id_prefix_generation)
    ]
    
    passed = 0
    total = len(tests)
    
    for test_name, test_func in tests:
        print(f"\n📋 Тест: {test_name}")
        try:
            if test_func():
                print(f"✅ {test_name} - ПРОЙДЕН")
                passed += 1
            else:
                print(f"❌ {test_name} - ПРОВАЛЕН")
        except Exception as e:
            print(f"❌ {test_name} - ОШИБКА: {e}")
    
    print(f"\n🎯 Результаты: {passed}/{total} тестов пройдено")
    
    if passed == total:
        print("🎉 Все тесты пройдены успешно!")
        return True
    else:
        print("⚠️  Некоторые тесты провалены")
        return False


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)