cmake_minimum_required(VERSION 3.22)
project(yoinkr_krita_ink VERSION 0.1.0 LANGUAGES CXX)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_AUTOMOC ON)
find_package(libobs CONFIG REQUIRED)
find_package(obs-frontend-api CONFIG REQUIRED)
find_package(Qt6 REQUIRED COMPONENTS Widgets)
add_library(yoinkr-krita-ink MODULE annotation.cpp
  donor/libs/widgets/KoTriangleColorSelector.cpp donor/libs/widgets/KoTriangleColorSelector.h
  donor/libs/widgets/KisColorSelectorInterface.cpp donor/libs/widgets/KisColorSelectorInterface.h)
target_include_directories(yoinkr-krita-ink PRIVATE compat donor/libs/widgets donor/libs/pigment)
target_link_libraries(yoinkr-krita-ink PRIVATE OBS::libobs OBS::obs-frontend-api Qt6::Widgets)
set_target_properties(yoinkr-krita-ink PROPERTIES PREFIX "")
