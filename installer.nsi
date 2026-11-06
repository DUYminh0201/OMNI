Unicode true

!define PRODUCT_NAME "Omnira Studio"
!define PRODUCT_VERSION "1.2.7"
!define PRODUCT_PUBLISHER "Omnira Team (com.omnipage.studio)"
!define PRODUCT_WEB_SITE "https://omnira.vn"
!define PRODUCT_DIR_REGKEY "Software\Microsoft\Windows\CurrentVersion\App Paths\Omnira Studio.exe"
!define PRODUCT_UNINST_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\Omnira Studio"

RequestExecutionLevel user
SetCompressor /SOLID zlib

!include "MUI2.nsh"
!include "FileFunc.nsh"
!include "LogicLib.nsh"

Name "${PRODUCT_NAME} ${PRODUCT_VERSION}"
OutFile "Omnira-Studio-Setup-1.2.7.exe"
InstallDir "$LOCALAPPDATA\Programs\Omnira Studio"
InstallDirRegKey HKCU "${PRODUCT_DIR_REGKEY}" ""
ShowInstDetails show
ShowUnInstDetails show

!define MUI_ICON "app_icon.ico"
!define MUI_UNICON "app_icon.ico"
!define MUI_ABORTWARNING

# UI Pages
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES

!define MUI_FINISHPAGE_RUN "$INSTDIR\Omnira Studio.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Khởi chạy Omnira Studio ngay"
!insertmacro MUI_PAGE_FINISH

# Uninstaller Pages
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_UNPAGE_FINISH

!insertmacro MUI_LANGUAGE "English"

# Version Information
VIProductVersion "1.2.7.0"
VIAddVersionKey "ProductName" "${PRODUCT_NAME}"
VIAddVersionKey "CompanyName" "${PRODUCT_PUBLISHER}"
VIAddVersionKey "LegalCopyright" "Copyright (C) 2026 Omnira Team"
VIAddVersionKey "FileDescription" "Omnira Studio Setup"
VIAddVersionKey "FileVersion" "${PRODUCT_VERSION}"
VIAddVersionKey "ProductVersion" "${PRODUCT_VERSION}"

Function .onInit
  # Close running instance of Omnira Studio if open
  nsExec::Exec 'taskkill /F /IM "Omnira Studio.exe" /T'
FunctionEnd

Section "MainSection" SEC01
  SetOutPath "$INSTDIR"
  SetOverwrite on

  DetailPrint "Đang chuẩn bị gói dữ liệu cài đặt..."
  InitPluginsDir
  SetOutPath "$PLUGINSDIR"
  File "7za.exe"
  File "app.7z"

  DetailPrint "Đang giải nén tập tin và thư viện Omnira Studio..."
  nsExec::ExecToLog '"$PLUGINSDIR\7za.exe" x "$PLUGINSDIR\app.7z" -o"$INSTDIR" -aoa'

  DetailPrint "Đang dọn dẹp tập tin tạm..."
  Delete "$PLUGINSDIR\app.7z"
  Delete "$PLUGINSDIR\7za.exe"

  SetOutPath "$INSTDIR"
  WriteUninstaller "$INSTDIR\Uninstall Omnira Studio.exe"

  DetailPrint "Đang tạo phím tắt màn hình chính và Start Menu..."
  # Desktop Shortcut
  CreateShortCut "$DESKTOP\Omnira Studio.lnk" "$INSTDIR\Omnira Studio.exe" "" "$INSTDIR\resources\app_icon.ico" 0

  # Start Menu Shortcuts
  CreateDirectory "$SMPROGRAMS\Omnira Studio"
  CreateShortCut "$SMPROGRAMS\Omnira Studio\Omnira Studio.lnk" "$INSTDIR\Omnira Studio.exe" "" "$INSTDIR\resources\app_icon.ico" 0
  CreateShortCut "$SMPROGRAMS\Omnira Studio\Gỡ cài đặt Omnira Studio.lnk" "$INSTDIR\Uninstall Omnira Studio.exe" "" "$INSTDIR\Uninstall Omnira Studio.exe" 0

  # Windows Registry Integration
  WriteRegStr HKCU "${PRODUCT_DIR_REGKEY}" "" "$INSTDIR\Omnira Studio.exe"
  WriteRegStr HKCU "${PRODUCT_UNINST_KEY}" "DisplayName" "${PRODUCT_NAME}"
  WriteRegStr HKCU "${PRODUCT_UNINST_KEY}" "UninstallString" '"$INSTDIR\Uninstall Omnira Studio.exe"'
  WriteRegStr HKCU "${PRODUCT_UNINST_KEY}" "DisplayIcon" "$INSTDIR\resources\app_icon.ico,0"
  WriteRegStr HKCU "${PRODUCT_UNINST_KEY}" "DisplayVersion" "${PRODUCT_VERSION}"
  WriteRegStr HKCU "${PRODUCT_UNINST_KEY}" "URLInfoAbout" "${PRODUCT_WEB_SITE}"
  WriteRegStr HKCU "${PRODUCT_UNINST_KEY}" "Publisher" "${PRODUCT_PUBLISHER}"
  WriteRegStr HKCU "${PRODUCT_UNINST_KEY}" "InstallLocation" "$INSTDIR"

  # Register AppUserModelID for taskbar icon binding
  WriteRegStr HKCU "Software\Classes\AppUserModelId\com.omnipage.studio" "DisplayName" "${PRODUCT_NAME}"
  WriteRegStr HKCU "Software\Classes\AppUserModelId\com.omnipage.studio" "IconUri" "$INSTDIR\resources\app_icon.ico"

  # Refresh Windows icon cache immediately
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'

  DetailPrint "Hoàn tất cài đặt Omnira Studio thành công!"
SectionEnd

Function un.onInit
  nsExec::Exec 'taskkill /F /IM "Omnira Studio.exe" /T'
FunctionEnd

Section Uninstall
  DetailPrint "Đang đóng các tiến trình Omnira Studio và máy chủ..."
  nsExec::Exec 'taskkill /F /IM "Omnira Studio.exe" /T'

  DetailPrint "Đang xóa phím tắt..."
  Delete "$DESKTOP\Omnira Studio.lnk"
  RMDir /r "$SMPROGRAMS\Omnira Studio"

  DetailPrint "Đang xóa dữ liệu cài đặt..."
  RMDir /r "$INSTDIR"

  DetailPrint "Đang xóa thông tin registry..."
  DeleteRegKey HKCU "${PRODUCT_UNINST_KEY}"
  DeleteRegKey HKCU "${PRODUCT_DIR_REGKEY}"
  DeleteRegKey HKCU "Software\Classes\AppUserModelId\com.omnipage.studio"

  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'

  SetAutoClose true
SectionEnd
