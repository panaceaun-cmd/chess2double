#!/usr/bin/env node
// fix-target-sdk.js
// ------------------------------------------------------------------
// Запускать ПОСЛЕ "bubblewrap init" и ПЕРЕД "bubblewrap build" —
// из той же папки, где лежит сгенерированный проект (там, где
// появилась папка "app").
//
// Зачем: по состоянию на момент написания этого скрипта Bubblewrap
// и PWABuilder всё ещё генерируют проект с targetSdkVersion 35, а
// Google Play с 31 августа 2026 требует minimum 36 для новых
// приложений. Это открытая, ещё не закрытая проблема в самих этих
// инструментах (issue отслеживается на их GitHub) — этот скрипт
// не "чинит" сами инструменты (я не имею доступа к их коду), а
// автоматически патчит СГЕНЕРИРОВАННЫЙ ими файл после каждого
// запуска, чтобы вам не пришлось помнить об этом вручную. Работает
// одинаково и до, и после 31 августа — если Google в будущем поднимет
// требование ещё выше, просто поменяйте число 36 на новое в самом
// начале файла и запустите скрипт заново.
// ------------------------------------------------------------------
const fs = require('fs');
const path = require('path');

const REQUIRED_SDK = 36; // поднимайте это число, если Google в будущем повысит требование
const REQUIRED_MIN_SDK = 23; // минимум, который требует библиотека Play Billing

const gradlePath = path.join(process.cwd(), 'app', 'build.gradle');

if (!fs.existsSync(gradlePath)) {
  console.error('\n❌ Не найден файл app/build.gradle в текущей папке.');
  console.error('   Запустите этот скрипт из папки проекта, созданной командой "bubblewrap init"');
  console.error('   (там, где лежит подпапка "app").\n');
  process.exit(1);
}

const original = fs.readFileSync(gradlePath, 'utf8');

// Покрываем разные варианты синтаксиса Gradle, которые встречаются в
// разных версиях шаблона: "targetSdkVersion 35", "targetSdkVersion = 35",
// "targetSdk 35", "targetSdk = 35" — и то же самое для compileSdk.
function bump(content, key, target){
  const re = new RegExp('(' + key + '\\s*=?\\s*)(\\d+)', 'g');
  return content.replace(re, (match, prefix, num) => {
    const current = parseInt(num, 10);
    return prefix + (current < target ? target : current);
  });
}

let patched = original;
patched = bump(patched, 'targetSdkVersion', REQUIRED_SDK);
patched = bump(patched, 'targetSdk', REQUIRED_SDK);
patched = bump(patched, 'compileSdkVersion', REQUIRED_SDK);
patched = bump(patched, 'compileSdk', REQUIRED_SDK);
patched = bump(patched, 'minSdkVersion', REQUIRED_MIN_SDK);
patched = bump(patched, 'minSdk', REQUIRED_MIN_SDK);

const beforeMatches = original.match(/(targetSdkVersion|targetSdk|compileSdkVersion|compileSdk|minSdkVersion|minSdk)\s*=?\s*\d+/g) || [];
const afterMatches = patched.match(/(targetSdkVersion|targetSdk|compileSdkVersion|compileSdk|minSdkVersion|minSdk)\s*=?\s*\d+/g) || [];

if(beforeMatches.length === 0){
  console.log('\n⚠️  Не нашёл строк targetSdkVersion/compileSdkVersion в файле.');
  console.log('   Возможно, структура файла изменилась — откройте app/build.gradle');
  console.log('   вручную и проверьте текущие значения SDK.\n');
  process.exit(1);
}

if(patched === original){
  console.log('\n✅ Уже всё в порядке — ' + beforeMatches.join(', ') + ' (менять нечего).\n');
  process.exit(0);
}

fs.writeFileSync(gradlePath + '.bak', original);
fs.writeFileSync(gradlePath, patched);

console.log('\nДо исправления:  ' + beforeMatches.join(', '));
console.log('После исправления: ' + afterMatches.join(', '));
console.log('\n✅ Готово. Резервная копия сохранена как app/build.gradle.bak');
console.log('Теперь можно запускать: bubblewrap build\n');
