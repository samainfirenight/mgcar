#!/usr/bin/env bash

if [[ -d "./MGB" && ! -L "./MGB" ]] ; then
    read -p "Are you sure to delete the MGB folder and all contents? (y/n)" choice
		case "$choice" in
		  y|Y )
			echo "Removing the MGB Directory..."
			rm -rf MGB
				if [ ! -d "./MGB" ] ; then
					echo "Directory MGB is deleted."
					    read -p "Do your want to clone MGB from gitHub? (y/n)" choice
							case "$choice" in
							y|Y )
								echo "Cloning MGB repository..."
								#Put git clone action here
								git clone https://github.com/samainfirenight/MGB
								echo "The repsitory MGB has been cloned."
								exit;;
							n|N )
								echo "Aborting MGB repository cloning. Exiting."
								exit;;
							* )
								echo "Invalid option. Could not complete. Exiting."
								exit;;
						esac
				fi	
			exit;;
		  n|N )
			echo "The action has been aborted. Exiting."
			exit;;
		  * )
			echo "Invalid option. Could not complete. Exiting."
			exit;;
    esac
fi


if [ ! -d "./MGB" ] ; then
		read -p "Do your want to clone MGB from gitHub? (y/n)" choice
			case "$choice" in
			y|Y )
				echo "Cloning MGB repository..."
				#Put git clone action here
				git clone https://github.com/samainfirenight/MGB
				echo "The repsitory MGB has been cloned."
				exit;;
			n|N )
				echo "Aborting MGB repository cloning. Exiting."
				exit;;
			* )
				echo "Invalid option. Could not complete. Exiting."
				exit;;
		esac
fi	
